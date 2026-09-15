import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './design-system.css'
import './components/workspace.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
