import React from 'react';

/**
 * WhatsApp glyph (the speech bubble with the handset, as on the public site's WhatsApp button), drawn inline so it
 * follows the text colour (currentColor) and sizes like a lucide icon. Use it wherever the portal links to WhatsApp.
 */
export const WhatsAppIcon: React.FC<React.SVGProps<SVGSVGElement> & { size?: number | string }> = ({ size = 24, ...props }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden focusable="false" {...props}>
    <path d="M19.05 4.91A9.82 9.82 0 0 0 12.04 2C6.6 2 2.17 6.43 2.17 11.87c0 1.74.45 3.44 1.32 4.94L2.09 22l5.32-1.39a9.86 9.86 0 0 0 4.63 1.18h.01c5.44 0 9.87-4.43 9.87-9.87 0-2.64-1.03-5.12-2.87-7.01Zm-7.01 15.2h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.16.83.84-3.08-.2-.32a8.18 8.18 0 0 1-1.26-4.36c0-4.52 3.68-8.2 8.21-8.2 2.19 0 4.25.86 5.8 2.41a8.15 8.15 0 0 1 2.4 5.8c0 4.52-3.68 8.2-8.14 8.25Zm4.5-6.14c-.25-.12-1.46-.72-1.69-.8-.23-.08-.39-.12-.56.12-.16.25-.64.8-.78.97-.14.16-.29.18-.53.06-.25-.12-1.04-.38-1.98-1.22-.73-.65-1.23-1.46-1.37-1.7-.14-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.12-.14.16-.25.25-.41.08-.16.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.42h-.48c-.16 0-.43.06-.66.31-.23.25-.86.84-.86 2.06 0 1.21.88 2.38 1 2.55.12.16 1.74 2.65 4.21 3.72.59.25 1.05.41 1.41.52.59.19 1.13.16 1.56.1.47-.07 1.46-.6 1.66-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.29Z" />
  </svg>
);

export default WhatsAppIcon;
