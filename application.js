const express = require('express')
const { performance } = require('perf_hooks');
const { MongoClient, ServerApiVersion } = require('mongodb');
// const uri = 'mongodb url here'
const Redis = require('redis')
const redisClient = Redis.createClient()
redisClient.connect();

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

const app = express()
app.use(express.json())

//Get Patient Details
app.get('/patient/details', async (req, res) => {
    await getPatientData(req, res, '/patient/details');
});

//Get Patient Diagnosis
app.get('/patient/diagnosis', async (req, res) => {
    await getPatientData(req, res, '/patient/diagnosis');
});

//Get Patient Admissions
app.get('/patient/admissions', async (req, res) => {
    await getPatientData(req, res, '/patient/admissions');
});

//Get Patient Lab Results
app.get('/patient/labresults', async (req, res) => {
    await getPatientData(req, res, '/patient/labresults');
});

// Prognosis page
app.get('/prognosis', async (req, res) => {
    const start = performance.now();
    try {
        const query = { Symptoms: { $all: ["abdominal pain", "yellowing of eyes", "nausea"] } }
        const options = {projection:{_id: 0, Disease: 1}};
        const collectionName = "prognosis"
        const redisKey = options ? `${JSON.stringify({ query, options })}_${collectionName}` : `${JSON.stringify(query)}_${collectionName}`;

        // check if Redis has query result

        const redisResult = await redisClient.get(redisKey);
        if (redisResult != null) {
            const redisData = JSON.parse(redisResult);
            res.json(redisData)
        } else {
            const database = client.db("frederick");
            const collection = database.collection("prognosis");
            const result = await collection.find(query, options).toArray();
            await redisClient.setEx(redisKey, 3600, JSON.stringify(result))
            res.json(result)
        }

        const end = performance.now();
        const duration = end - start;
        console.log(`Request took ${duration} milliseconds`);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/patient/diagnosis/add', async (req, res) => {
    try {
        const database = client.db('frederick');
        const collection = database.collection('patient_diagnosis');
        const query = { Symptoms: { $all: ["abdominal pain", "yellowing of eyes", "nausea"] } }
        const options = {};
        const redisKey = `${JSON.stringify({ query, options })}`;

        // Find the latest AdmissionID for the patient
        const latestAdmission = await collection.findOne(
            { PatientID: "03A481F5-B32A-4A91-BD42-43EB78FEBA77" },
            { projection: { AdmissionID: 1 }, sort: { AdmissionID: -1 } }
        );
        const newAdmissionID = latestAdmission ? latestAdmission.AdmissionID + 1 : 1;

        // Create the new diagnosis object with the incremented AdmissionID
        const newDiagnosis = {
            PatientID: "03A481F5-B32A-4A91-BD42-43EB78FEBA77",
            AdmissionID: newAdmissionID,
            PrimaryDiagnosisCode: "newDiagnosisCode",
            PrimaryDiagnosisDescription: "Has Bofa"
        };

        // Insert the new diagnosis into the patient_details collection
        await collection.insertOne(newDiagnosis);
        redisClient.DEL(redisKey);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

//Update patient detail
app.get('/patient/details/update', async (req, res) => {
    const start = performance.now();
    try {
        const database = client.db("frederick");
        const collection = database.collection("patient_details")
        const query = { PatientID: "03A481F5-B32A-4A91-BD42-43EB78FEBA77" };
        const options = {};
        const redisKey = `${JSON.stringify({ query, options })}`;
        const update = { $set: { PatientMaritalStatus: 'test23' } };

        collection.updateOne(query, update, (err, res) => {
            if (err) throw err;
        })
        const result = await collection.find(query).toArray();
        res.json(result);
        redisClient.DEL(redisKey);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
        res.send(err);
    }
});


// Route to shutdown the server
app.get('/shutdown', (req, res) => {
    // Send response
    res.send('Server shutting down...');

    // Send shutdown signal to server process
    process.kill(process.pid, 'SIGTERM');
});

process.on('SIGTERM', () => {
    console.log('Server shutting down...');
    server.close(() => {
        console.log('Server shutdown complete.');
    });
});

const server = app.listen(4000, () => {
    console.log("Server listening on port 4000");
});

const getPatientData = async (req, res, path) => {
    const start = performance.now();
    try {
        const query = { PatientID: "21792512-2D40-4326-BEA2-A40127EB24FF" }
        const options = {};
        const redisKey = `${JSON.stringify({ query, options })}`

        const redisResult = await redisClient.get(redisKey);
        if (redisResult != null) {
            const redisData = JSON.parse(redisResult);
            switch (path) {
                case '/patient/details':
                    res.json(redisData.patientDetails);
                    break;
                case '/patient/diagnosis':
                    res.json(redisData.patientDiagnosis);
                    break;
                case '/patient/admissions':
                    res.json(redisData.patientAdmissions);
                    break;
                case '/patient/labresults':
                    res.json(redisData.patientLabResults);
                    break;
                default:
                    res.json(redisData.patientDetails);
            }
        } else {
            const database = client.db("frederick");
            const patientDetailsCollection = database.collection("patient_details");
            const patientAdmissionsCollection = database.collection("patient_admissions");
            const patientDiagnosisCollection = database.collection("patient_diagnosis");
            const patientLabResultsCollection = database.collection("patient_lab_results");
            const [
                patientDetails,
                patientAdmissions,
                patientDiagnosis,
                patientLabResults
            ] = await Promise.all([
                patientDetailsCollection.find(query, options).toArray(),
                patientAdmissionsCollection.find(query, options).toArray(),
                patientDiagnosisCollection.find(query, options).toArray(),
                patientLabResultsCollection.find(query, options).toArray(),
            ]);

            const result = {
                patientDetails,
                patientAdmissions,
                patientDiagnosis,
                patientLabResults,
            };

            await redisClient.setEx(redisKey, 3600, JSON.stringify(result));
            switch (path) {
                case '/patient/details':
                    res.json(result.patientDetails);
                    break;
                case '/patient/diagnosis':
                    res.json(result.patientDiagnosis);
                    break;
                case '/patient/admissions':
                    res.json(result.patientAdmissions);
                    break;
                case '/patient/labresults':
                    res.json(result.patientLabResults);
                    break;
                default:
                    res.json(result.patientDetails);
            }
        }

        const end = performance.now();
        const duration = end - start;
        console.log(`Request took ${duration} milliseconds`);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
};
