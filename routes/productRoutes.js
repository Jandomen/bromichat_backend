const express = require("express");
const router = express.Router();
const { authenticate } = require("../middlewares/auth");
const upload = require("../middlewares/multer");

const {
  createProduct,
  getUserProducts,
  searchProducts,
  getRandomProducts,
  updateProduct,
  deleteProduct,
  uploadProductImage, 
} = require("../controllers/productController");

router.post("/", authenticate, createProduct);              
router.put("/:id", authenticate, updateProduct);            
router.get("/user/:userId", getUserProducts);               
router.get("/search", searchProducts);                       
router.get("/feed", getRandomProducts);                      
router.delete("/:id", authenticate, deleteProduct);         

router.post("/upload", authenticate, upload.single("image"), uploadProductImage);

module.exports = router;
