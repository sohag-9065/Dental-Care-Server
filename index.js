const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.mbdxrli.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: 'UnAuthorized access' });
  }
  const token = authHeader.split(' ')[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: 'Forbidden access' });
    }
    req.decoded = decoded;
    next();
  })
}

async function run() {
  try {
    await client.connect();
    const serviceCollection = client.db('doctors_portal').collection('services');
    const bookingCollection = client.db('doctors_portal').collection('booking');
    const usersCollection = client.db('doctors_portal').collection('users');

    app.get('/services', async (req, res) => {
      const query = {};
      const cursor = serviceCollection.find(query);
      const services = await cursor.toArray();
      res.send(services);
    })

    app.get('/user', verifyJWT, async (req, res) => {
      const users = await usersCollection.find().toArray();
      res.send(users);
    })

    app.get('/admin/:email', verifyJWT , async(req, res)=> {
      
      const email = req.params.email;
      const user = await usersCollection.findOne({email: email});
      const isAdmin = user.role === 'admin';
      return res.send({admin: isAdmin});
    })
    

    app.put('/user/admin/:email', verifyJWT, async (req, res) => {
      console.log("Problem inside");
      const email = req.params.email;
      const requester = req.decoded.email;
      const requyesterAccount = await usersCollection.findOne({ email: requester });
      if (requyesterAccount.role === 'admin') {
        const filter = { email: email };
        const updateDoc = {
          $set: { role: 'admin' },
        };
        const result = await usersCollection.updateOne(filter, updateDoc);
        return res.send({ result });
      }
      return res.status(403).send({ message: 'Forbidden access' });
     
    })

    // user token generate by email
    app.put('/user/:email', async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await usersCollection.updateOne(filter, updateDoc, options);
      const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
      res.send({ result, token });
    })

    // available  appoinmnet check
    app.get('/available', async (req, res) => {
      const date = req.query.date;
      const services = await serviceCollection.find().toArray();

      const query = { date: date };
      const booking = await bookingCollection.find(query).toArray();

      services.forEach(service => {
        const serviceBooking = booking.filter(b => b.treatment === service.name);
        const booked = serviceBooking.map(s => s.slot);
        const available = service.slots.filter(s => !booked.includes(s));
        service.slots = available;
      })
      res.send(services);
    })

    // booking  get

    app.get('/booking', verifyJWT, async (req, res) => {
      const patient = req.query.patient;
      const decodedEmail = req.decoded.email;
      if (patient === decodedEmail) {
        const query = { patient: patient };
        const booking = await bookingCollection.find(query).toArray();
        // console.log(booking);
        return res.send(booking);
      }
      else {
        return res.status(403).send({ message: 'Forbidden access' });
      }

    })
// booking  post
    app.post('/booking', async (req, res) => {
      const booking = req.body;
      const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient }
      const exists = await bookingCollection.findOne(query);
      if (exists) {
        return res.send({ success: false, booking: exists });
      }
      const result = await bookingCollection.insertOne(booking);

      return res.send({ success: true, result });
    })

    console.log("database Connected");
  } finally {
    // await client.close();
  }
}

run().catch(console.dir);

app.get('/', (req, res) => {
  res.send("Hello from Doctors Uncle!")
})

app.listen(port, () => {
  console.log(`Doctors app listening on port ${port}`)
})