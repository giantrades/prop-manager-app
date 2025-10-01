import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import './styles.css';
import TradeForm from './Components/TradeForm';
import Trades from './pages/Trades';
import Montecarlo from './pages/Montecarlo';
import Navbar from './Navbar.jsx';
import Strategies from './pages/Strategies';
import { useJournal } from "@apps/journal-state";
import { useData } from "@apps/state";
import {
  initGoogleDrive,
  isSignedIn,
  signIn,
  signOut,
  onSignChange,
  listFiles,
} from "@apps/utils/googleDrive.js";

export default function App() {
  
  return (
    <div>
      <Navbar />
      <main className="container">
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/trades/new" element={<TradeForm />} />
        <Route path="/trades" element={<Trades/>} />
        <Route path="/Strategies" element={<Strategies/>} />
        <Route path="/Montecarlo" element={<Montecarlo/>} />
        <Route path="/Settings" element={<Settings/>} />
      </Routes>
      </main>
  </div> 
);
}
