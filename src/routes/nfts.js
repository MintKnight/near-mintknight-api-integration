const router = require('express').Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
// Controllers
const NftController = require('../controllers/nfts');
// Schemas & Middlewares
const userProtected = require('../middlewares/auth');
// Utils
const { sendError } = require('../utils/error');

// Create multer object
const imageUpload = multer({
  dest: 'files',
  // limits: { fileSize: 30 * 1000 * 1024 }, // 30M
  limits: { fileSize: 3000 * 1000 * 1024 }, // 3000M = 3G
});

function checkUpload(req, res, next) {
  let basedir = `${__dirname}/../../files`;
  basedir = path.normalize(basedir);
  if (!fs.existsSync(basedir)) fs.mkdirSync(basedir);
  next();
}
const fileSizeLimitErrorHandler = (err, req, res, next) => {
  if (err) {
    sendError(res, err);
  } else {
    next();
  }
};

/**
 * @openapi
 * tags:
 *   name: nfts
 *   description: NFT API Endpoints
 * components:
 *   schemas:
 *     AddNFT:
 *       type: object
 *       properties:
 *         contractId:
 *           type: string
 *         name:
 *           type: string
 *         description:
 *           type: string
 *         tokenId:
 *           type: number
 *         file:
 *           type: string
 *           format: binary
 *         dropId:
 *           type: string
 *         mediaId:
 *           type: string
 *         attributes:
 *           type: string
 *     MintNFT:
 *       type: object
 *       properties:
 *         walletId:
 *           type: string
 *         to:
 *           description: walletId to
 *           type: string
 *         skey:
 *           description: partial key (from)
 *           type: string
 *         address:
 *           type: string
 *     TransferNFT:
 *       type: object
 *       properties:
 *         walletId:
 *           type: string
 *         to:
 *           description: walletId to
 *           type: string
 *         skey:
 *           description: partial key (from)
 *           type: string
 *         address:
 *           type: string
 *     NFT:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         name:
 *           type: string
 *         description:
 *           type: string
 *         contractId:
 *           type: string
 *         metadata:
 *           type: string
 *         state:
 *           type: string
 *           enum:
 *             - draft
 *             - minted
 *         createdAt:
 *           type: string
 *           format: date
 *         updatedAt:
 *           type: string
 *           format: date
 *         mintedAt:
 *           type: string
 *           format: date
 *         lastLockAt:
 *           type: string
 *           format: date
 *         addressOfLastLock:
 *           type: string
 *         isLockedBySignature:
 *           type: boolean
 *         lastLockBySignatureAt:
 *           type: string
 *           format: date
 *         addressOfLastLockBySignature:
 *           type: string
 *         walletId:
 *           type: string
 *         minterId:
 *           type: string
 */

/**
 * @openapi
 * /nfts/v2:
 *   post:
 *     summary: Add a new NFT into DB
 *     tags:
 *     - nfts
 *     components:
 *       securitySchemes:
 *         BearerAuth:
 *           type: http
 *           scheme: bearer
 *     requestBody:
 *       description: NFT to be added
 *       content:
 *         application/json:
 *           schema:
 *            $ref: '#/components/schemas/AddNFT'
 *     responses:
 *       201:
 *         description: NFT added into DB (draft)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#components/schemas/NFT'
 *       400:
 *         description: The server cannot process the request due to a controlled error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#components/schemas/Error'
 *       401:
 *         description: Unauthorized. The client request has not been completed because it lacks valid authentication credentials for the requested resource
 */
router.post('/v2', userProtected(), checkUpload, imageUpload.single('file'), fileSizeLimitErrorHandler, async (req, res) => {
  const body = { ...req.body }; // Don´t change. Necessary due to call from SDK
  NftController.addNFT(
    req.context,
    body,
    req.file,
  )
    .then((result) => res.status(201).json(result))
    .catch((e) => sendError(res, e));
});

/**
 * @openapi
 * /nfts/v2/upload/{contractId}:
 *   post:
 *     summary: Upload NFTs in bulk mode
 *     tags:
 *     - nfts
 *     components:
 *       securitySchemes:
 *         BearerAuth:
 *           type: http
 *           scheme: bearer
 *     parameters:
 *       - name: contractId
 *         in: path
 *         description: Id of the contract
 *     requestBody:
 *       description: Body params
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               files:
 *                 type: array
 *                 items:
 *                   $ref: '#components/schemas/File'
 *               dropId:
 *                 type: string
 *     responses:
 *       201:
 *         description: NFTs added into DB (draft)
 *       400:
 *         description: The server cannot process the request due to a controlled error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#components/schemas/Error'
 *       401:
 *         description: Unauthorized. The client request has not been completed because it lacks valid authentication credentials for the requested resource
 */
router.post('/v2/upload/:contractId', userProtected(), checkUpload, imageUpload.array('files'), fileSizeLimitErrorHandler, async (req, res) => {
  NftController.uploadNFTs(
    req.params.contractId,
    req.files,
    req.body.dropId,
    req.body.csvVersion,
  )
    .then((result) => res.status(201).json(result))
    .catch((e) => sendError(res, e));
});

/**
 * @openapi
 * /nfts/v2/metadata/{nftId}:
 *   put:
 *     summary: Upload the NFT´s metadata into Arweave
 *     tags:
 *     - nfts
 *     components:
 *       securitySchemes:
 *         BearerAuth:
 *           type: http
 *           scheme: bearer
 *     parameters:
 *       - name: nftId
 *         in: query
 *         description: Id of the NFT
 *     responses:
 *       200:
 *         description: The NFT´s metadata has been queued to be uploaded
 *         content:
 *           application/json:
 *             schema:
 *              type: object
 *              properties:
 *                taskId:
 *                  type: string
 *                nft:
 *                  $ref: '#components/schemas/NFT'
 *       400:
 *         description: The server cannot process the request due to a controlled error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#components/schemas/Error'
 *       401:
 *         description: Unauthorized. The client request has not been completed because it lacks valid authentication credentials for the requested resource
 */
router.put('/v2/metadata/:nftId', userProtected(), async (req, res) => {
  NftController.addMetadata(req.context, req.params.nftId)
    .then((result) => res.json(result))
    .catch((e) => sendError(res, e));
});

/**
 * @openapi
 * /nfts/v2/mint/{nftId}:
 *   put:
 *     summary: Mints an NFT
 *     tags:
 *     - nfts
 *     components:
 *       securitySchemes:
 *         BearerAuth:
 *           type: http
 *           scheme: bearer
 *     parameters:
 *       - name: nftId
 *         in: query
 *         description: Id of the NFT
 *     requestBody:
 *       description: Mint body params
 *       content:
 *         application/json:
 *           schema:
 *            $ref: '#/components/schemas/MintNFT'
 *     responses:
 *       200:
 *         description: The NFT has been queued to be minted
 *         content:
 *           application/json:
 *             schema:
 *              type: object
 *              properties:
 *                taskId:
 *                  type: string
 *                nft:
 *                  $ref: '#components/schemas/NFT'
 *       400:
 *         description: The server cannot process the request due to a controlled error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#components/schemas/Error'
 *       401:
 *         description: Unauthorized. The client request has not been completed because it lacks valid authentication credentials for the requested resource
 */
router.put('/v2/mint/:nftId', userProtected(), async (req, res) => {
  NftController.mint(req.context, req.params.nftId, req.body)
    .then((result) => res.json(result))
    .catch((e) => sendError(res, e));
});

/**
 * @openapi
 * /nfts/v2/transfer/{nftId}:
 *   put:
 *     summary: Transfer an NFT
 *     tags:
 *     - nfts
 *     components:
 *       securitySchemes:
 *         BearerAuth:
 *           type: http
 *           scheme: bearer
 *     parameters:
 *       - name: nftId
 *         in: query
 *         description: Id of the NFT
 *     requestBody:
 *       description: Transfer body params
 *       content:
 *         application/json:
 *           schema:
 *            $ref: '#/components/schemas/TransferNFT'
 *     responses:
 *       200:
 *         description: The NFT has been queued to be transferred
 *         content:
 *           application/json:
 *             schema:
 *              type: object
 *              properties:
 *                taskId:
 *                  type: string
 *                nft:
 *                  $ref: '#components/schemas/NFT'
 *       400:
 *         description: The server cannot process the request due to a controlled error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#components/schemas/Error'
 *       401:
 *         description: Unauthorized. The client request has not been completed because it lacks valid authentication credentials for the requested resource
 */
router.put('/v2/transfer/:nftId', userProtected(), async (req, res) => {
  NftController.transfer(req.context, req.params.nftId, req.body)
    .then((result) => res.json(result))
    .catch((e) => sendError(res, e));
});

/**
 * @openapi
 * /nfts/v2/{nftId}:
 *   put:
 *     summary: Update NFT
 *     tags:
 *     - nfts
 *     components:
 *       securitySchemes:
 *         BearerAuth:
 *           type: http
 *           scheme: bearer
 *     parameters:
 *       - name: nftId
 *         in: query
 *         description: Id of the NFT
 *     requestBody:
 *       description: NFT to be updated
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/NFT'
 *     responses:
 *       200:
 *         description: The NFT has been updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#components/schemas/NFT'
 *       400:
 *         description: The server cannot process the request due to a controlled error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#components/schemas/Error'
 *       401:
 *         description: Unauthorized. The client request has not been completed because it lacks valid authentication credentials for the requested resource
 */
router.put('/v2/:nftId', userProtected(), async (req, res) => {
  const body = { ...req.body }; // Don´t change. Necessary due to call from SDK
  NftController.updateNFT(
    req.params.nftId,
    body,
  )
    .then((result) => res.json(result))
    .catch((e) => sendError(res, e));
});

/**
 * @openapi
 * /nfts/v2/byContract/{contractId}:
 *   get:
 *     tags:
 *     - nfts
 *     summary: Get all NFT by contract
 *     components:
 *       securitySchemes:
 *         BearerAuth:
 *           type: http
 *           scheme: bearer
 *     parameters:
 *       - name: contractId
 *         in: query
 *         description: Id of the Contract
 *     responses:
 *       200:
 *         description: Returns all NFT by contract
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#components/schemas/NFT'
 *       400:
 *         description: The server cannot process the request due to a controlled error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#components/schemas/Error'
 *       401:
 *         description: Unauthorized. The client request has not been completed because it lacks valid authentication credentials for the requested resource
 */
router.get('/v2/byContract/:contractId', userProtected(), async (req, res) => {
  NftController.getAllNFTsByContract(req.params.contractId)
    .then((result) => res.json(result))
    .catch((e) => sendError(res, e));
});

/**
 * @openapi
 * /nfts/v2/byWallet/{walletId}:
 *   get:
 *     tags:
 *     - nfts
 *     summary: Get all NFT by wallet
 *     components:
 *       securitySchemes:
 *         BearerAuth:
 *           type: http
 *           scheme: bearer
 *     parameters:
 *       - name: walletId
 *         in: query
 *         description: Id of the Wallet
 *     responses:
 *       200:
 *         description: Returns all NFT by wallet
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#components/schemas/NFT'
 *       400:
 *         description: The server cannot process the request due to a controlled error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#components/schemas/Error'
 *       401:
 *         description: Unauthorized. The client request has not been completed because it lacks valid authentication credentials for the requested resource
 */
router.get('/v2/byWallet/:walletId', userProtected(), async (req, res) => {
  NftController.getAllNFTsByWallet(req.params.walletId)
    .then((result) => res.json(result))
    .catch((e) => sendError(res, e));
});

/**
 * @openapi
 * /nfts/v2/blockchain/{address}:
 *   get:
 *     tags:
 *     - nfts
 *     summary: Get all real NFT from blockchain by address
 *     components:
 *       securitySchemes:
 *         BearerAuth:
 *           type: http
 *           scheme: bearer
 *     parameters:
 *       - name: address
 *         in: query
 *         description: Owner Address
 *     responses:
 *       200:
 *         description: Returns all NFT
 *         content:
 *           application/json:
 *             schema:
 *              type: object
 *              properties:
 *                 ownedNfts:
 *                   type: array
 *                 totalCount:
 *                   type: number
 *                 blockHash:
 *                   type: string
 *       400:
 *         description: The server cannot process the request due to a controlled error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#components/schemas/Error'
 *       401:
 *         description: Unauthorized. The client request has not been completed because it lacks valid authentication credentials for the requested resource
 */
router.get('/v2/blockchain/:address', userProtected(), async (req, res) => {
  NftController.getAllNFTsFromBlockchain(req.context.project, req.params.address, req.query)
    .then((result) => res.json(result))
    .catch((e) => sendError(res, e));
});

/**
 * @openapi
 * /nfts/v2/{contractId}/{tokenId}:
 *   get:
 *     tags:
 *     - nfts
 *     summary: Get the metadata of one NFT
 *     components:
 *       securitySchemes:
 *         BearerAuth:
 *           type: http
 *           scheme: bearer
 *     parameters:
 *       - name: contractId
 *         in: query
 *         description: Id of the NFT
 *       - name: tokenId
 *         in: query
 *         description: Id of the Token in the NFT
 *     responses:
 *       200:
 *         description: Returns all NFT by wallet
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#components/schemas/NFT'
 *       400:
 *         description: The server cannot process the request due to a controlled error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#components/schemas/Error'
 *       401:
 *         description: Unauthorized. The client request has not been completed because it lacks valid authentication credentials for the requested resource
 */
router.get('/v2/:contractId/:tokenId', async (req, res) => {
  NftController.getMetadata(req.params.contractId, req.params.tokenId)
    .then((result) => res.json(result))
    .catch((e) => sendError(res, e));
});
// Look out: It´s called from https://nft.mintknight.com/{contractId}/{tokenId}
router.get('/:contractId/:tokenId', async (req, res) => {
  NftController.getMetadata(req.params.contractId, req.params.tokenId)
    .then((result) => res.json(result))
    .catch((e) => sendError(res, e));
});

/**
 * @openapi
 * /nfts/v2/{nftId}:
 *   delete:
 *     tags:
 *     - nfts
 *     summary: Delete NFT
 *     components:
 *       securitySchemes:
 *         BearerAuth:
 *           type: http
 *           scheme: bearer
 *     parameters:
 *       - name: nftId
 *         in: path
 *         description: Id of the NFT
 *     responses:
 *       200:
 *         description: Deleted NFT
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#components/schemas/NFT'
 *       400:
 *         description: The server cannot process the request due to a controlled error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#components/schemas/Error'
 *       401:
 *         description: Unauthorized. The client request has not been completed because it lacks valid authentication credentials for the requested resource
 */
router.delete('/v2/:nftId', userProtected(), async (req, res) => {
  NftController.deleteNft(req.params.nftId)
    .then((result) => res.json(result))
    .catch((e) => sendError(res, e));
});

module.exports = router;
