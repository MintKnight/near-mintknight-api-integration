const router = require('express').Router();
// Controllers
const TokenController = require('../controllers/tokens');
// Schemas & Middlewares
const userProtected = require('../middlewares/auth');
// Utils
const { sendError } = require('../utils/error');

/**
 * @openapi
 * tags:
 *   name: tokens
 *   description: Tokens ERC20 API Endpoints
 * components:
 *   schemas:
 *     MintToken:
 *       type: object
 *       properties:
 *         contractId:
 *           description: ERC20 Contract Id
 *           type: string
 *         walletId:
 *           description: Wallet Id of the project (minter)
 *           type: string
 *         skey:
 *           description: Partial private key (from)
 *           type: string
 *         value:
 *           description: Amount to mint
 *           type: string
 *         to:
 *           description: Wallet Id of the receiver. (to or address. Only needed one of them)
 *           type: string
 *         address:
 *           description: Public address of the receiver. (to or address. Only needed one of them)
 *           type: string
 *     TransferToken:
 *       type: object
 *       properties:
 *         contractId:
 *           description: ERC20 Contract Id
 *           type: string
 *         walletId:
 *           description: Sender wallet Id (any wallet Id from MK)
 *           type: string
 *         skey:
 *           description: partial key (from)
 *           type: string
 *         value:
 *           description: Amount to transfer
 *           type: string
 *         to:
 *           description: Receiver wallet Id (any wallet Id from MK. to or address. Only needed one of them)
 *           type: string
 *         address:
 *           description: Public address of the receiver. (to or address. Only needed one of them)
 *           type: string
 *     TokenInfo:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *         symbol:
 *           type: string
 *         totalSupply:
 *           type: number
 *           description: Total supply of tokens of a specific ERC20 contract
 *         balanceOf:
 *           type: number
 *           description: Amount of tokens of a specific wallet
 */

/**
 * @openapi
 * /tokens/v2:
 *   post:
 *     summary: Mint Tokens
 *     tags:
 *     - tokens
 *     requestBody:
 *       description: Token to be minted
 *       content:
 *         application/json:
 *           schema:
 *            $ref: '#/components/schemas/MintToken'
 *     responses:
 *       201:
 *         description: The tokens have been queued to be minted
 *         content:
 *           application/json:
 *             schema:
 *              type: object
 *              properties:
 *                taskId:
 *                  type: string
 *       400:
 *         description: The server cannot process the request due to a controlled error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#components/schemas/Error'
 *       401:
 *         description: Unauthorized. The client request has not been completed because it lacks valid authentication credentials for the requested resource
 */
router.post('/v2/', userProtected(), async (req, res) => {
  TokenController.mint(req.context, req.body)
    .then((result) => res.status(201).json(result))
    .catch((e) => sendError(res, e));
});

/**
 * @openapi
 * /tokens/v2:
 *   put:
 *     summary: Transfer tokens
 *     tags:
 *     - tokens
 *     requestBody:
 *       description: Token to be transferred
 *       content:
 *         application/json:
 *           schema:
 *            $ref: '#/components/schemas/TransferToken'
 *     responses:
 *       200:
 *         description: The tokens have been queued to be transferred
 *         content:
 *           application/json:
 *             schema:
 *              type: object
 *              properties:
 *                taskId:
 *                  type: string
 *       400:
 *         description: The server cannot process the request due to a controlled error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#components/schemas/Error'
 *       401:
 *         description: Unauthorized. The client request has not been completed because it lacks valid authentication credentials for the requested resource
 */
router.put('/v2/', userProtected(), async (req, res) => {
  TokenController.transfer(req.context, req.body)
    .then((result) => res.json(result))
    .catch((e) => sendError(res, e));
});

/**
 * @openapi
 * /tokens/v2/{contractId}/{walletId}:
 *   get:
 *     tags:
 *     - tokens
 *     summary: Get the token info
 *     parameters:
 *       - name: contractId
 *         in: query
 *         description: Id of the Contract
 *       - name: walletId
 *         in: query
 *         description: Id of the Wallet
 *     responses:
 *       200:
 *         description: Returns the token info
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#components/schemas/TokenInfo'
 *       400:
 *         description: The server cannot process the request due to a controlled error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#components/schemas/Error'
 *       401:
 *         description: Unauthorized. The client request has not been completed because it lacks valid authentication credentials for the requested resource
 */
router.get('/v2/:contractId/:walletId', async (req, res) => {
  TokenController.getTokenInfo(req.params.contractId, req.params.walletId)
    .then((result) => res.json(result))
    .catch((e) => sendError(res, e));
});

/**
 * @openapi
 * /tokens/v2/balance/{contractId}/{walletId}:
 *   get:
 *     tags:
 *     - tokens
 *     summary: Get balance
 *     parameters:
 *       - name: contractId
 *         in: query
 *         description: Id of the Contract
 *       - name: walletId
 *         in: query
 *         description: Id of the Wallet
 *     responses:
 *       200:
 *         description: Returns the wallet´s balance
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
router.get('/v2/balance/:contractId/:walletId', async (req, res) => {
  TokenController.getBalance(req.params.contractId, req.params.walletId)
    .then((result) => res.send(result))
    .catch((e) => sendError(res, e));
});

module.exports = router;
