import React from 'react';
import BusinessConfigCenter from './BusinessConfigCenter.jsx';

export default function PublicPagePanel() {
  return (
    <BusinessConfigCenter
      section="public"
      title="Pagina publica"
      description="Edita la portada, textos, imagenes, estilo visual y etiquetas que ven tus clientes."
    />
  );
}
