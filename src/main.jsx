import '@fontsource/figtree/latin-400.css'
import '@fontsource/figtree/latin-500.css'
import '@fontsource/figtree/latin-600.css'
import '@fontsource/pixelify-sans/latin-400.css'
import '@fontsource/pixelify-sans/latin-600.css'
import vt323 from '@fontsource/vt323/files/vt323-latin-400-normal.woff2?url'
// Nokia look: the pixel font's numbers are hard to read, so digits come from a clearer terminal font
try {
  document.fonts.add(new FontFace('DST Digits', `url(${vt323})`, { unicodeRange: 'U+0030-0039, U+003A', sizeAdjust: '125%' }))
} catch { /* older browsers just use the pixel font */ }
// Look: classic or nokia (saved on this device)
try { document.documentElement.dataset.theme = localStorage.getItem('dst-theme') || 'classic' } catch { /* ignore */ }
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode><App /></StrictMode>,
)
