const Product = require("../models/Product");
const cloudinary = require('cloudinary').v2; 

const createProduct = async (req, res) => {
  try {
    const { title, description, price, currency, imageUrl } = req.body;

    if (!title || !price || !imageUrl) {
      return res.status(400).json({ message: "Faltan campos obligatorios" });
    }

    const product = new Product({
      user: req.user.id,
      title,
      description,
      price,
      currency: currency || "USD",
      imageUrl,
    });

    await product.save();
   // console.log("✅ Producto creado:", product);
    res.status(201).json(product);
  } catch (error) {
   // console.error("❌ Error al crear producto:", error);
    res.status(500).json({ message: "Error al crear producto" });
  }
};

const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, price, currency, imageUrl } = req.body;

    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ message: "Producto no encontrado" });

    if (product.user.toString() !== req.user.id) {
      return res.status(403).json({ message: "No autorizado" });
    }

    if (title) product.title = title;
    if (description) product.description = description;
    if (price) product.price = price;
    if (currency) product.currency = currency;
    if (imageUrl) product.imageUrl = imageUrl;

    await product.save();
    res.json({ message: "Producto actualizado", product });
  } catch (error) {
   // console.error("❌ Error al actualizar producto:", error);
    res.status(500).json({ message: "Error al actualizar producto" });
  }
};

const getUserProducts = async (req, res) => {
  try {
    const products = await Product.find({ user: req.params.userId })
      .sort({ createdAt: -1 })
      .populate("user", "username profilePicture");
    res.json(products);
  } catch (error) {
   // console.error("❌ Error al obtener productos del usuario:", error);
    res.status(500).json({ message: "Error al obtener productos del usuario" });
  }
};

const searchProducts = async (req, res) => {
  try {
    const query = req.query.query || "";
    const products = await Product.find({
      title: { $regex: query, $options: "i" },
    })
      .limit(40)
      .populate("user", "username profilePicture");
    res.json(products);
  } catch (error) {
   // console.error("❌ Error al buscar productos:", error);
    res.status(500).json({ message: "Error al buscar productos" });
  }
};

const getRandomProducts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const skip = (page - 1) * limit;

    const products = await Product.aggregate([
      { $sample: { size: 200 } },
      { $skip: skip },
      { $limit: limit },
    ]);

    const productsWithUser = await Product.populate(products, {
      path: "user",
      select: "username profilePicture",
    });

    res.json(productsWithUser);
  } catch (error) {
   // console.error("❌ Error al obtener feed random:", error);
    res.status(500).json({ message: "Error al obtener feed random" });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ message: "Producto no encontrado" });

    if (product.user.toString() !== req.user.id) {
      return res.status(403).json({ message: "No autorizado" });
    }

    await product.deleteOne();
    res.json({ message: "Producto eliminado" });
  } catch (error) {
   // console.error("❌ Error al eliminar producto:", error);
    res.status(500).json({ message: "Error al eliminar producto" });
  }
};

const uploadProductImage = async (req, res) => {
  try {
    if (!req.file) {
     // console.log('⚠️ No se subió ninguna imagen');
      return res.status(400).json({ message: 'No se subió ninguna imagen' });
    }

    console.log('📦 Imagen recibida:', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
    });

    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'products', resource_type: 'image' },
        (error, result) => {
          if (error) {
           // console.error(`❌ Error subiendo imagen a Cloudinary: ${error.message}`);
            return reject(error);
          }
         // console.log(`✅ Imagen subida a Cloudinary: ${result.secure_url}`);
          resolve(result);
        }
      );
      stream.end(req.file.buffer);
    });

    res.json({ url: result.secure_url });
  } catch (error) {
   // console.error('❌ Error subiendo imagen a Cloudinary:', error);
    res.status(500).json({ message: 'Error subiendo imagen', error: error.message });
  }
};

module.exports = {
  createProduct,
  updateProduct,
  getUserProducts,
  searchProducts,
  getRandomProducts,
  deleteProduct,
  uploadProductImage,
};
