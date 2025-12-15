const functions = require("firebase-functions");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * HTTP endpoint: calificar una activity y actualizar el promedio del worker.
 */
exports.rateActivity = functions.https.onRequest((req, res) => {
  const cors = require("cors")({ origin: true });
  cors(req, res, async () => {
    if (req.method === "OPTIONS") {
      return res.status(204).send("");
    }

    try {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const { activityId, rating } = body || {};

      const parsedRating = Number(rating);

      if (!activityId || Number.isNaN(parsedRating)) {
        return res.status(400).json({
          success: false,
          message: "Se requiere el id de la activity y el rating numérico.",
        });
      }

      if (parsedRating < 1 || parsedRating > 5) {
        return res.status(400).json({
          success: false,
          message: "El rating debe estar entre 1 y 5.",
        });
      }

      const activityRef = db.collection("activities").doc(activityId);

      await db.runTransaction(async (transaction) => {
        const activitySnap = await transaction.get(activityRef);
        if (!activitySnap.exists) {
          throw new Error("Activity no encontrada.");
        }

        const activityData = activitySnap.data() || {};
        const workerId =
          activityData.worker?.workerId;

        if (!workerId) {
          throw new Error("La activity no tiene worker asociado.");
        }

        const workerRef = db.collection("workers").doc(workerId);
        const workerSnap = await transaction.get(workerRef);

        if (!workerSnap.exists) {
          throw new Error("Worker no encontrado para esta activity.");
        }

        const workerData = workerSnap.data() || {};
        const currentAmount = Number(workerData.amountRating) || 0;
        const currentAverage = Number(workerData.starRating) || 0;

        const newAmount = currentAmount + 1;
        const newAverage =
          (currentAverage * currentAmount + parsedRating) / newAmount;

        transaction.update(activityRef, {
          rating: parsedRating,
          ratedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        transaction.update(workerRef, {
          starRating: Number(newAverage.toFixed(2)),
          amountRating: newAmount,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      return res.status(200).json({
        success: true,
        message: "Rating registrado correctamente.",
      });
    } catch (error) {
      console.error("❌ Error registrando rating:", error);
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });
});
