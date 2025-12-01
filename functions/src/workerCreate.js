// src/workers/workerFunctions.js
const functions = require("firebase-functions");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const storage = admin.storage();

/**
 * HTTP endpoint: crear un nuevo worker
 * Sube la foto de perfil a Storage
 * y crea el documento del worker en Firestore con el link resultante.
 */
exports.workerCreate = functions.https.onRequest((req, res) => {
  const cors = require("cors")({ origin: true });
  cors(req, res, async () => {
    if (req.method === "OPTIONS") {
      return res.status(204).send("");
    }

    try {
      const body =
        typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const {
        uid,
        name,
        lastName,
        workerName,
        phone,
        photo,
        description,
        services,
      } = body;

      if (
        !uid ||
        !name ||
        !lastName ||
        !workerName ||
        !photo ||
        !description ||
        !services ||
        !phone
      ) {
        return res.status(400).json({
          success: false,
          message: "Faltan campos requeridos.",
        });
      }

      const bucket = storage.bucket();

      // 🔹 Convertir y guardar la foto obligatoria
      const photoBuffer = Buffer.from(photo, "base64");
      const photoPath = `workers/profile-${uid}.jpg`;
      const file = bucket.file(photoPath);
      
      await file.save(photoBuffer, { contentType: "image/jpeg" });
      
      // ✅ Hacer el archivo público para acceso directo
      await file.makePublic();

      // ✅ Generar URL pública
      const photoURL = `https://storage.googleapis.com/${bucket.name}/${photoPath}`;

      // 🔹 Crear documento del worker en Firestore
      await db.collection("workers").doc(uid).set({
        uid,
        name,
        lastName,
        workerName,
        phone,
        photo: photoURL,
        description,
        services,
        joinedAt: admin.firestore.FieldValue.serverTimestamp(),
        geohash: "",
        status: "inactive",
        completedJobs: 0,
        starRating: 0,
        amountRating: 0,
      });

      return res.status(200).json({
        success: true,
        message: "Worker creado correctamente",
        workerId: uid,
      });
    } catch (error) {
      console.error("❌ Error creando worker:", error);
      return res
        .status(500)
        .json({ success: false, error: error.message });
    }
  });
});
