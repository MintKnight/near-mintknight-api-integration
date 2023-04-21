const router = require('express').Router();
// Controllers
const WalletController = require('../controllers/wallets');
// Schemas & Middlewares
const userProtected = require('../middlewares/auth');
// Utils
const Wallets = require('../utils/wallets');
const { sendError } = require('../utils/error');

/**
 * @openapi
 * tags:
 *   name: wallets
 *   description: Wallet API Endpoints
 * components:
 *   schemas:
 *     AddWallet:
 *       type: object
 *       properties:
 *         refUser:
 *           type: string
 *         walletType:
 *           type: string
 *           description: Type of wallet
 *           enum:
 *             - onchain
 *             - eoa
 *             - signer
 *     Wallet:
 *       type: object
 *       description: Wallet model (object)
 *       properties:
 *         _id:
 *           type: string
 *         projectId:
 *           type: string
 *         type:
 *           type: string
 *           description: Type of wallet
 *           enum:
 *             - onchain
 *             - eoa
 *             - signer
 *         address:
 *           type: string
 *         owner:
 *           type: string
 *         state:
 *           type: string
 *           enum:
 *             - active
 *             - blocked
 *         network:
 *           type: string
 *         refUser:
 *           type: string
 *         nonce1:
 *           type: number
 *         nonce2:
 *           type: number
 *         nonce3:
 *           type: number
 *         status:
 *           type: string
 *           enum:
 *             - draft
 *             - onchain
 *         createdAt:
 *           type: string
 *           format: date
 *         bytecode:
 *           type: string
 */

/**
 * @openapi
 * /wallets/v2:
 *   post:
 *     summary: Add a new wallet into DB
 *     tags:
 *     - wallets
 *     components:
 *       securitySchemes:
 *         BearerAuth:
 *           type: http
 *           scheme: bearer
 *     requestBody:
 *       description: Wallet to be added
 *       content:
 *         application/json:
 *           schema:
 *            $ref: '#/components/schemas/AddWallet'
 *     responses:
 *       201:
 *         description: Wallet added into DB (draft)
 *         content:
 *           application/json:
 *             schema:
 *              type: object
 *              properties:
 *                skey1:
 *                  type: string
 *                skey2:
 *                  type: string
 *                wallet:
 *                  $ref: '#components/schemas/Wallet'
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
  WalletController.addWallet(req.context, req.body)
    .then((result) => res.status(201).json(result))
    .catch((e) => sendError(res, e));
});

/**
 * @openapi
 * /wallets/v2/deploy/{walletId}:
 *   put:
 *     summary: Deploy an existent wallet from DB
 *     tags:
 *     - wallets
 *     components:
 *       securitySchemes:
 *         BearerAuth:
 *           type: http
 *           scheme: bearer
 *     parameters:
 *       - name: walletId
 *         in: path
 *         description: Id of the wallet
 *     responses:
 *       200:
 *         description: Deployed wallet
 *         content:
 *           application/json:
 *             schema:
 *              type: object
 *              properties:
 *                taskId:
 *                  type: string
 *                wallet:
 *                  $ref: '#components/schemas/Wallet'
 *       400:
 *         description: The server cannot process the request due to a controlled error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#components/schemas/Error'
 *       401:
 *         description: Unauthorized. The client request has not been completed because it lacks valid authentication credentials for the requested resource
 */
router.put('/v2/deploy/:walletId', userProtected(), async (req, res) => {
  WalletController.deployWallet(req.context, req.params.walletId)
    .then((result) => res.status(200).json(result))
    .catch((e) => sendError(res, e));
});

/**
 *  NO SWAGGER!!
 * /wallets:
 *   get:
 *     summary: Get MK wallets or master wallets
 *     responses:
 *       200:
 *         description: Returns master wallets balance
 */
router.get('/', async (req, res) => {
  Wallets.getMasterWalletsBalances()
    .then((result) => res.json(result))
    .catch((e) => sendError(res, e));
});

/**
 * @openapi
 * /wallets/v2/{walletId}:
 *   get:
 *     summary: Get wallet
 *     tags:
 *     - wallets
 *     components:
 *       securitySchemes:
 *         BearerAuth:
 *           type: http
 *           scheme: bearer
 *     parameters:
 *       - name: walletId
 *         in: query
 *         description: Wallet ID
 *     responses:
 *       200:
 *         description: Returns the wallet
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#components/schemas/Wallet'
 *       400:
 *         description: The server cannot process the request due to a controlled error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#components/schemas/Error'
 *       401:
 *         description: Unauthorized. The client request has not been completed because it lacks valid authentication credentials for the requested resource
 */
router.get('/v2/:walletId', userProtected(), async (req, res) => {
  WalletController.getWallet(req.params.walletId)
    .then((result) => res.json(result))
    .catch((e) => sendError(res, e));
});

/**
 * @openapi
 * /wallets/v2:
 *   get:
 *     summary: Get all wallets of the project
 *     tags:
 *     - wallets
 *     components:
 *       securitySchemes:
 *         BearerAuth:
 *           type: http
 *           scheme: bearer
 *     responses:
 *       200:
 *         description: Returns wallets of the project
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#components/schemas/Wallet'
 *       400:
 *         description: The server cannot process the request due to a controlled error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#components/schemas/Error'
 *       401:
 *         description: Unauthorized. The client request has not been completed because it lacks valid authentication credentials for the requested resource
 */
router.get('/v2', userProtected(), (req, res) => {
  WalletController.getWallets(req.context.project)
    .then((result) => res.json(result))
    .catch((e) => sendError(res, e));
});

/**
 * @openapi
 * /wallets/v2/addAndDeployWallets/{numberOfWallets}:
 *   post:
 *     summary: Add & Deploy several wallets at the same time
 *     tags:
 *     - wallets
 *     components:
 *       securitySchemes:
 *         BearerAuth:
 *           type: http
 *           scheme: bearer
 *     parameters:
 *       - name: numberOfWallets
 *         in: query
 *         description: Number of wallet to create and deploy
 *     requestBody:
 *       description: Common info (walletType, refUser) for all wallets
 *       content:
 *         application/json:
 *           schema:
 *            $ref: '#/components/schemas/AddWallet'
 *     responses:
 *       201:
 *         description: The wallets are deploying
 *         content:
 *           application/json:
 *             schema:
 *              type: object
 *              properties:
 *                taskId:
 *                  type: string
 *                wallets:
 *                  type: array
 *                  items:
 *                    type: object
 *                    properties:
 *                      skey1:
 *                        type: string
 *                      skey2:
 *                        type: string
 *                      wallet:
 *                        $ref: '#components/schemas/Wallet'
 *       400:
 *         description: The server cannot process the request due to a controlled error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#components/schemas/Error'
 *       401:
 *         description: Unauthorized. The client request has not been completed because it lacks valid authentication credentials for the requested resource
 */
router.post('/v2/addAndDeployWallets/:numberOfWallets', userProtected(), async (req, res) => {
  WalletController.addAndDeployWallets(req.context, req.params.numberOfWallets, req.body)
    .then((result) => res.status(201).json(result))
    .catch((e) => sendError(res, e));
});

module.exports = router;
