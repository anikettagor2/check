const admin = require("firebase-admin");

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        })
    });
}
const db = admin.firestore();

async function check() {
    try {
        const snap = await db.collection("revisions").orderBy("createdAt", "desc").limit(5).get();
        snap.forEach(doc => {
            const data = doc.data();
            console.log(`Revision ${doc.id}: playbackId=${data.playbackId}, videoUrl=${data.videoUrl}`);
        });
    } catch (e) {
        console.error(e);
    }
}
check();
