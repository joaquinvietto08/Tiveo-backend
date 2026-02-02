// src/requests/requestsFunctions.js
const functions = require("firebase-functions");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * HTTP endpoint: crear activity a partir de una request
 * Invocada desde la app del trabajador o cliente al confirmar una solicitud.
 */
exports.createActivityFromRequest = functions.https.onRequest((req, res) => {
  const cors = require("cors")({ origin: true });
  cors(req, res, async () => {
    if (req.method === "OPTIONS") {
      return res.status(204).send("");
    }

    try {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const { requestId, newStatus, postulationId } = body;

      if (!requestId || !newStatus) {
        return res.status(400).json({
          success: false,
          message: "Se requiere el ID de la request y el nuevo estado.",
        });
      }

      const requestRef = db.collection("requests").doc(requestId);
      const requestSnap = await requestRef.get();

      if (!requestSnap.exists) {
        return res.status(404).json({ success: false, message: "Request no encontrada." });
      }

      const requestData = requestSnap.data();

      // 🔹 Obtener datos de la postulación
      let postulationData = {};
      if (postulationId) {
        const postulationRef = db.collection("postulations").doc(postulationId);
        const postulationSnap = await postulationRef.get();

        if (postulationSnap.exists) {
          postulationData = postulationSnap.data();
        }
      }

      // 🔹 Extraer datos de la postulación y del worker
      // Si hay worker en el body (trabajo directo), usarlo; si no, usar el de la postulación
      const workerFromBody = body.worker;
      const workerFromPostulation = postulationData.worker;
      const workerData = workerFromBody || workerFromPostulation;

      if (!workerData || !workerData.uid) {
        return res.status(400).json({
          success: false,
          message: "Se requieren los datos del trabajador.",
        });
      }

      const activityData = {
        ...requestData,
        // Datos de la postulación (puede estar vacío en trabajos directos)
        budget: postulationData.budget || null,
        // Datos del worker (desde body o postulación)
        worker: {
          uid: workerData.uid,
          workerName: workerData.workerName || "",
          firstName: workerData.firstName || "",
          lastName: workerData.lastName || "",
          photoURL: workerData.photoURL || null,
        },
        status: newStatus,
        paymentStatus: "pending",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      await db.collection("activities").doc(requestId).set(activityData);

      await requestRef.update({ status: "closed" });

      return res.status(200).json({
        success: true,
        requestId,
      });
    } catch (error) {
      console.error("❌ Error creando activity:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  });
});
