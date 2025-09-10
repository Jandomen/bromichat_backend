const User = require('../models/User');
const Gallery = require('../models/Gallery');
const cloudinary = require('../config/cloudinaryConfig');

exports.uploadPhoto = async (req, res) => {
  try {
    if (!req.file) {
     // console.warn('⚠️ No se recibió archivo en la solicitud');
      return res.status(400).json({ error: 'No se subió ningún archivo' });
    }

   // console.log('📸 Recibida solicitud para subir una foto');
    const result = await cloudinary.uploader.upload(req.file.path);

    const photo = new Gallery({
      user: req.user.id,
      imageUrl: result.secure_url,
      description: req.body.description || '',
    });

    await photo.save();
   // console.log('🗂️ Foto guardada en base de datos:', photo._id);

    res.status(201).json(photo);
  } catch (err) {
   // console.error('❌ Error al subir la foto:', err.message);
    res.status(500).json({ error: 'Error al subir la foto' });
  }
};


exports.getUserPhotos = async (req, res) => {
  try {
   // console.log(`🔍 Buscando fotos del usuario: ${req.params.userId}`);
    const photos = await Gallery.find({ user: req.params.userId }).sort({ createdAt: -1 });
    
   // console.log(`📷 Total fotos encontradas: ${photos.length}`);
    res.json(photos);
  } catch (err) {
   // console.error('❌ Error al obtener las fotos:', err.message);
    res.status(500).json({ error: 'Error al obtener las fotos' });
  }
};

exports.updatePhoto = async (req, res) => {
  try {
   // console.log(`✏️ Solicitando actualización de la foto: ${req.params.id}`);
    const photo = await Gallery.findById(req.params.id);

    if (!photo) {
     // console.warn('⚠️ Foto no encontrada');
      return res.status(404).json({ error: 'Foto no encontrada' });
    }

    if (photo.user.toString() !== req.user.id) {
     // console.warn('⛔ Usuario no autorizado para editar esta foto');
      return res.status(403).json({ error: 'No autorizado' });
    }

    photo.description = req.body.description || photo.description;
    await photo.save();

   // console.log('✅ Foto actualizada correctamente');
    res.json(photo);
  } catch (err) {
   // console.error('❌ Error al actualizar la foto:', err.message);
    res.status(500).json({ error: 'Error al actualizar la foto' });
  }
};

exports.deletePhoto = async (req, res) => {
  try {
   // console.log(`🗑️ Solicitud de eliminación de foto: ${req.params.id}`);
    
    const photo = await Gallery.findById(req.params.id);
    if (!photo) return res.status(404).json({ error: 'Foto no encontrada' });

    if (photo.user.toString() !== req.user.id) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    await Gallery.findByIdAndDelete(req.params.id); 
   // console.log('🧹 Foto eliminada de la base de datos');
    res.json({ message: 'Foto eliminada correctamente' });

  } catch (err) {
   // console.error('❌ Error al eliminar la foto:', err.message);
    res.status(500).json({ error: 'Error al eliminar la foto' });
  }
};




