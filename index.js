const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.xn3gujg.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
// console.log("url",uri);

client.connect(() => {
    console.log('connected');
})


//  JSON WEB TOKEN

function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'UnAuthorized access' });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden access' })
        }
        req.decoded = decoded;
        next();
    });
}

async function run() {
    try {
        await client.connect();
        // ALL COLLECTIONS

        const categoryCollection = client.db('utilize').collection('categoryCollection');
        const productCollection = client.db('utilize').collection('productCollection');
        const userCollection = client.db('utilize').collection('users');
        const purchaseCollection = client.db('utilize').collection('purchases');
        const ratingCollection = client.db('utilize').collection('ratings');
        const paymentCollection = client.db('utilize').collection('payments');
        const wishListCollection = client.db('utilize').collection('wishList');


        // Check Admin
        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester });
            if (requesterAccount.role === 'Admin') {
                next();
            }
            else {
                res.status(403).send({ message: 'forbidden' });
            }
        }

        // Check Seller
        const verifySeller = async (req, res, next) => {
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester });
            if (requesterAccount.role === 'Seller') {
                next();
            }
            else {
                res.status(403).send({ message: 'forbidden' });
            }
        }
        // Getting all categories to show in Home page
        app.get('/categories', async (req, res) => {
            const query = {};
            const cursor = categoryCollection.find(query);
            const categories = await cursor.toArray();
            res.send(categories);
        });

        // Getting products by categoryID
        app.get('/categories/:id', async (req, res) => {
            const query = {};
            const cursor = productCollection.find(query);
            const products = await cursor.toArray();
            res.send(products);
        });

        // Making an Order
        app.post("/purchase", verifyJWT, async (req, res) => {
            const purchase = req.body;
            const result = await purchaseCollection.insertOne(purchase);
            return res.send({ success: true, result: result })
        })

        // Getting my order
        app.get('/myOrder', async (req, res) => {
            const email = req.query.email;
            const query = { buyerEmail: email };
            const tool = await purchaseCollection.find(query).toArray();
            res.send(tool);
        })

        //  My order delete
        app.delete("/purchase/:id", verifyJWT, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const result = await purchaseCollection.deleteOne(filter);
            res.send(result)
        })

        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const role = req.params.role;
            const user = { ...req.body, role: role };
            const filter = { email: email };
            const options = { upsert: true };

            const updateDoc = {
                $set: user,
            };
            const result = await userCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1w' });
            res.send({ result, token });
        })

        app.put("/userLogin/:email", async (req, res) => {
            const email = req.params.email;
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1w' });
            res.send({
                token
            });
        })

        // adding product to wishlist
        app.post("/add_wish", verifyJWT, async (req, res) => {
            const wishProduct = req.body;
            const result = await wishListCollection.insertOne(wishProduct);
            return res.send({ success: true, result: result })
        })

        // get products added to the wishlist
        app.get('/wishlist/:user', verifyJWT, async (req, res) => {
            const user = req.params.user;
            console.log(user);
            const query = { user: user };
            const cursor = wishListCollection.find(query);
            const products = await cursor.toArray();
            res.send(products);
        });

        app.put("/updateRole/:email/:role", async (req, res) => {
            const email = req.params.email
            const role = req.params.role
            const query = { email: email };
            const options = { upsert: true }

            const updateDoc = {
                $set: { email: email, role: role },
            };
            const result = await userCollection.updateOne(query, updateDoc, options);
            res.send(result);
        })

        app.get("/user/:email", async (req, res) => {
            const email = req.params.email
            const query = { email: email };
            const user = await userCollection.findOne(query);
            res.send(user);

        })

        // Adding new product in UI and database
        app.post('/product', verifyJWT, verifySeller, async (req, res) => {
            const tool = req.body;
            const result = await productCollection.insertOne(tool);
            res.send(result);
        });

        // get product
        app.get('/products/:name', verifyJWT, verifySeller, async (req, res) => {
            const name = req.params.name
            const query = { seller: name };
            const products = await productCollection.find(query).toArray();
            res.send(products);
        });
        // Deleting certain tool from UI and database
        app.delete("/products/:id", verifyJWT, verifySeller, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const result = await productCollection.deleteOne(filter);
            res.send(result)
        })

        // Get All Buyers
        app.get("/allBuyers", verifyJWT, verifyAdmin, async (req, res) => {
            const query = { role: "Buyer" }
            const buyers = await userCollection.find(query).toArray()

            res.send(buyers)
        })

        // Get All Sellers
        app.get("/allSellers", verifyJWT, verifyAdmin, async (req, res) => {
            const query = { role: "Seller" }
            const sellers = await userCollection.find(query).toArray()

            res.send(sellers)
        })

        // Get advertised Products
        app.get("/advertise", async (req, res) => {
            const query = { ad: true };
            const advertise = await productCollection.find(query).toArray();
            res.send(advertise)
        })

        // Make product advertised true
        app.put("/makeAdvertise/:id", async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) }
            const options = { upsert: true }
            const updateDoc = {
                $set: {
                    ad: true
                }
            };
            const result = await productCollection.updateOne(filter, updateDoc, options);
            console.log(result)
            res.send(result)
        })

        // Delete user

        app.delete("/deleteUser/:id", verifyJWT, verifyAdmin, async (req, res) => {
            const _id = req.params.id
            const result = userCollection.deleteOne({ _id: ObjectId(_id) });

            res.send(result)
        })


    } finally {

    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Hello From Utilize!')
})

app.listen(port, () => {
    console.log(`Utilize listening on port ${port}`)
})
