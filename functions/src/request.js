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
      const { requestId, newStatus } = body;

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

      await db.collection("activities").doc(requestId).set({
        ...requestData,
        status: newStatus,
        paymentStatus: "pending",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

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
