import '@fontsource/figtree/latin-400.css'
import '@fontsource/figtree/latin-500.css'
import '@fontsource/figtree/latin-600.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode><App /></StrictMode>,
)
