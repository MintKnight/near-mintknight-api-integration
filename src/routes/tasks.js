const router = require('express').Router();
// Controllers
const TaskController = require('../controllers/tasks');
// Utils
const { sendError } = require('../utils/error');

/**
 * @openapi
 * tags:
 *   name: tasks
 *   description: Tasks API Endpoints
 * components:
 *   schemas:
 *     Task:
 *       type: object
 *       description: Task model (object)
 *       properties:
 *         _id:
 *           type: string
 *         projectId:
 *           type: string
 *         network:
 *           type: string
 *           enum:
 *             - localhost
 *             - mumbai
 *             - polygon
 *         walletIndex:
 *           type: number
 *         txHash:
 *           type: string
 *         cost:
 *           type: number
 *         txType:
 *           type: string
 *           enum:
 *             - wallet
 *             - media
 *             - metadata
 *             - contract
 *             - mint
 *             - mintTo
 *             - transferFrom
 *             - transfer
 *             - setVerifier
 *             - setMinter
 *             - transferOwnership
 *             - setDefaultRoyalty
 *             - getNFTs
 *         state:
 *           type: string
 *           enum:
 *             - idle
 *             - queued
 *             - running
 *             - success
 *             - failed
 *         startedAt:
 *           type: string
 *           format: date
 *         endedAt:
 *           type: string
 *           format: date
 *         tryAgainAt:
 *           type: string
 *           format: date
 *         willTryAgainAt:
 *           type: string
 *           format: date
 *         wallet1:
 *           type: string
 *         wallet2:
 *           type: string
 *         wallets:
 *           type: array
 *         tries:
 *           type: number
 *         webhookType:
 *           type: string
 *         webhookState:
 *           type: string
 *           enum:
 *             - idle
 *             - pending
 *             - success
 *             - failed
 *         webhookLastCallAt:
 *           type: string
 *           format: date
 *         webhookErrorCounter:
 *           type: number
 *         address:
 *           type: string
 *         addresses:
 *           type: array
 *         data:
 *           type: string
 */

/**
 * @openapi
 * /tasks/v2/{taskId}:
 *   get:
 *     tags:
 *     - tasks
 *     summary: Get task
 *     components:
 *       securitySchemes:
 *         BearerAuth:
 *           type: http
 *           scheme: bearer
 *     parameters:
 *       - name: taskId
 *         in: query
 *         description: Id of the Task
 *     responses:
 *       200:
 *         description: Returns the task
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#components/schemas/Task'
 *       400:
 *         description: The server cannot process the request due to a controlled error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#components/schemas/Error'
 *       401:
 *         description: Unauthorized. The client request has not been completed because it lacks valid authentication credentials for the requested resource
 */
router.get('/v2/:taskId'/*, userProtected()*/, async (req, res) => {
  TaskController.getTask(req.params.taskId)
    .then((result) => res.json(result))
    .catch((e) => sendError(res, e));
});

/**
 *  NO SWAGGER!!
 * /tasks/v2/alchemy/webhook:
 *   post:
 *     summary: Alchemy notify MK when the Tx has been mined or dropped
 */
router.post('/v2/alchemy/webhook', async (req, res) => {
  TaskController.checkAlchemyWebhook(req.body)
    .then(() => res.status(200).send())
    .catch((e) => sendError(res, e));
});

module.exports = router;
