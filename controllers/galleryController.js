const Gallery = require('../models/Gallery');
const { uploadToCloudinary } = require('../config/cloudinaryConfig');

exports.uploadPhoto = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'No se subió ningún archivo o buffer vacío' });
    }

    const result = await uploadToCloudinary(req.file.buffer);

    const photo = new Gallery({
      user: req.user.id,
      imageUrl: result.secure_url,
      description: req.body.description || '',
    });

    await photo.save();
    res.status(201).json(photo);

  } catch (err) {
    //console.error('❌ Error en uploadPhoto:', err);
    res.status(500).json({ error: 'Error al subir la foto' });
  }
};

exports.getUserPhotos = async (req, res) => {
  try {
    const photos = await Gallery.find({ user: req.params.userId }).sort({ createdAt: -1 });
    res.json(photos);
  } catch (err) {
    //console.error('❌ Error al obtener las fotos:', err);
    res.status(500).json({ error: 'Error al obtener las fotos' });
  }
};

exports.updatePhoto = async (req, res) => {
  try {
    const photo = await Gallery.findById(req.params.id);
    if (!photo) return res.status(404).json({ error: 'Foto no encontrada' });
    if (photo.user.toString() !== req.user.id) return res.status(403).json({ error: 'No autorizado' });

    photo.description = req.body.description || photo.description;

    if (req.file && req.file.buffer) {
      const result = await uploadToCloudinary(req.file.buffer);
      photo.imageUrl = result.secure_url;
    }

    await photo.save();
    res.json(photo);

  } catch (err) {
    //console.error('❌ Error al actualizar la foto:', err);
    res.status(500).json({ error: 'Error al actualizar la foto' });
  }
};

exports.deletePhoto = async (req, res) => {
  try {
    const photo = await Gallery.findById(req.params.id);
    if (!photo) return res.status(404).json({ error: 'Foto no encontrada' });
    if (photo.user.toString() !== req.user.id) return res.status(403).json({ error: 'No autorizado' });

    await Gallery.findByIdAndDelete(req.params.id);
    res.json({ message: 'Foto eliminada correctamente' });

  } catch (err) {
    //console.error('❌ Error al eliminar la foto:', err);
    res.status(500).json({ error: 'Error al eliminar la foto' });
  }
};
