import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import Editor from './pages/Editor'
import Led from './pages/Led'
import Library from './pages/Library'
import Prompter from './pages/Prompter'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Library />} />
        <Route path="/songs/:id" element={<Editor />} />
        <Route path="/prompter" element={<Prompter />} />
        <Route path="/led" element={<Led />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
