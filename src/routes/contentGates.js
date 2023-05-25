const router = require('express').Router();
// Controllers
const ContentGatesController = require('../controllers/contentGates');
// Schemas & Middlewares
const userProtected = require('../middlewares/auth');
// Utils
const { sendError } = require('../utils/error');

/**
 * @openapi
 * tags:
 *   name: contents
 *   description: Content gates API Endpoints 
 * components:
 *   schemas:
 *     AddContentGate:
 *       type: object
 *       description: Content model (object)
 *       properties:
 *         contractId:
 *           type: string
 *         title:
 *           type: string
 *     ContentGate:
 *       type: object
 *       description: Content model (object)
 *       properties:
 *         _id:
 *           type: string
 *         projectId:
 *           type: string
 *         contractId:
 *           type: string
 *         title:
 *           type: string
 *     CheckContentGate:
 *       type: object
 *       description: Input params for checking the NFT
 *       properties:
 *         nftId:
 *           type: string
 *         address:
 *           type: string
 *         walletId:
 *           type: string
 *         contentGateId:
 *           type: string
 *         signature:
 *           type: string
 *         challenge:
 *           type: string
 * 
 */

/**
 * @openapi
 * /contentGates/v2/all:
 *   get:
 *     tags:
 *     - contents
 *     summary: Get content gates
 *     components:
 *       securitySchemes:
 *         BearerAuth:
 *           type: http
 *           scheme: bearer
 *     responses:
 *       200:
 *         description: Returns content gates list
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#components/schemas/ContentGate'
 *       400:
 *         description: The server cannot process the request due to a controlled error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#components/schemas/Error'
 *       401:
 *         description: Unauthorized. The client request has not been completed because it lacks valid authentication credentials for the requested resource
 */
router.get('/v2/all', userProtected(), async (req, res) => {
  ContentGatesController.getAll(req.context.project)
    .then((result) => res.json(result))
    .catch((e) => sendError(res, e));
});

/**
 * @openapi
 * /contentGates/v2/contentgate/{contentGateId}:
 *   get:
 *     tags:
 *     - contents
 *     summary: Get content gate
 *     components:
 *       securitySchemes:
 *         BearerAuth:
 *           type: http
 *           scheme: bearer
 *     responses:
 *       200:
 *         description: Returns content gate
 *         content:
 *            application/json:
 *              schema:
 *                $ref: '#/components/schemas/ContentGate'
 *       400:
 *         description: The server cannot process the request due to a controlled error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#components/schemas/Error'
 *       401:
 *         description: Unauthorized. The client request has not been completed because it lacks valid authentication credentials for the requested resource
 */
router.get('/v2/contentgate/:contentGateId', userProtected(), async (req, res) => {
  ContentGatesController.getContentGate(req.context.project, req.params.contentGateId)
    .then((result) => res.json(result))
    .catch((e) => sendError(res, e));
});

/**
 * @openapi
 * /contentGates/v2/challenge/{address}:
 *   get:
 *     tags:
 *     - contents
 *     summary: Get a new challenge
 *     parameters:
 *       - name: address
 *         in: path
 *         description: Public wallet address
 *     components:
 *       securitySchemes:
 *         BearerAuth:
 *           type: http
 *           scheme: bearer
 *     responses:
 *       200:
 *         description: Returns a new challenge
 *         content:
 *           text/plain:
 *            schema:
 *              type: string
 *       400:
 *         description: The server cannot process the request due to a controlled error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#components/schemas/Error'
 *       401:
 *         description: Unauthorized. The client request has not been completed because it lacks valid authentication credentials for the requested resource
 */
router.get('/v2/challenge/:address', userProtected(), async (req, res) => {
  ContentGatesController.getChallenge(req.context.project, req.params.address)
    .then((result) => res.json(result))
    .catch((e) => sendError(res, e));
});

/**
 * @openapi
 * /contentGates/v2/check:
 *   post:
 *     tags:
 *     - contents
 *     summary: Check if the content is available or not
 *     components:
 *       securitySchemes:
 *         BearerAuth:
 *           type: http
 *           scheme: bearer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *            $ref: '#/components/schemas/CheckContentGate'
 *     responses:
 *       200:
 *         description: Content is available
 *       400:
 *         description: Content is not available
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#components/schemas/Error'
 *       401:
 *         description: Unauthorized. The client request has not been completed because it lacks valid authentication credentials for the requested resource
 */
router.post('/v2/check', userProtected(), async (req, res) => {
  const body = { ...req.body }; // Don´t change. Necessary due to call from SDK
  ContentGatesController.verifyContentGate(req.context.project, body)
    .then((result) => res.status(200).json(result))
    .catch((e) => sendError(res, e));
});

/**
 * @openapi
 * /contentGates/v2:
 *   post:
 *     tags:
 *     - contents
 *     summary: Creates a new content gate
 *     components:
 *       securitySchemes:
 *         BearerAuth:
 *           type: http
 *           scheme: bearer
 *     requestBody:
 *       description: Content gate to be added
 *       content:
 *         application/json:
 *           schema:
 *            $ref: '#/components/schemas/AddContentGate'
 *     responses:
 *       201:
 *         description: Content gate has been added
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#components/schemas/ContentGate'
 *       400:
 *         description: The server cannot process the request due to a controlled error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#components/schemas/Error'
 *       401:
 *         description: Unauthorized. The client request has not been completed because it lacks valid authentication credentials for the requested resource
 */
router.post('/v2', userProtected(), async (req, res) => {
  const body = { ...req.body }; // Don´t change. Necessary due to call from SDK
  ContentGatesController.addContentGate(req.context.project, body)
    .then((result) => res.status(201).json(result))
    .catch((e) => sendError(res, e));
});

/**
 * @openapi
 * /contentGates/v2/{contentGateId}:
 *   put:
 *     tags:
 *     - contents
 *     summary: Update a Content gate
 *     parameters:
 *       - name: contentGateId
 *         in: path
 *         description: Id of the Content gate
 *     requestBody:
 *       description: Content gate to be added
 *       content:
 *         application/json:
 *           schema:
 *            $ref: '#/components/schemas/AddContentGate'
 *     responses:
 *       200:
 *         description: Content gate has been updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#components/schemas/ContentGate'
 *       400:
 *         description: The server cannot process the request due to a controlled error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#components/schemas/Error'
 *       401:
 *         description: Unauthorized. The client request has not been completed because it lacks valid authentication credentials for the requested resource
 */
router.put('/v2/:contentGateId', userProtected(), async (req, res) => {
  const body = { ...req.body }; // Don´t change. Necessary due to call from SDK
  ContentGatesController.updateContentGate(req.context.project, req.params.contentGateId, body)
    .then((result) => res.json(result))
    .catch((e) => sendError(res, e));
});

/**
 * @openapi
 * /contentGates/v2/{contentGateId}:
 *   delete:
 *     tags:
 *     - contents
 *     summary: Delete Content gate
 *     parameters:
 *       - name: contentGateId
 *         in: path
 *         description: Id of the Content gate
 *     responses:
 *       200:
 *         description: Content gate has been removed
 *       400:
 *         description: The server cannot process the request due to a controlled error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#components/schemas/Error'
 *       401:
 *         description: Unauthorized. The client request has not been completed because it lacks valid authentication credentials for the requested resource
 */
router.delete('/v2/:contentGateId', userProtected(), (req, res) => {
  ContentGatesController.deleteContentGate(req.context.project, req.params.contentGateId)
    .then((result) => res.json(result))
    .catch((e) => sendError(res, e));
});

module.exports = router;
