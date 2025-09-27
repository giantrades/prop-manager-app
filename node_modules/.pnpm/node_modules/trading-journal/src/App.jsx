import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import './styles.css';
import TradeForm from './Components/TradeForm';
import Trades from './pages/Trades';
import Montecarlo from './pages/Montecarlo';
import Navbar from './Navbar.jsx';
import Strategies from './pages/Strategies';

export default function App() {
  return (
    <div>
      <Navbar />
      <main className="p-4">
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/trades/new" element={<TradeForm />} />
        <Route path="/trades" element={<Trades/>} />
        <Route path="/Strategies" element={<Strategies/>} />
        <Route path="/Montecarlo" element={<Montecarlo/>} />
      </Routes>
      </main>
  </div> 
);
}
