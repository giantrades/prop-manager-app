// trading-journal/src/components/ExecutionsEditor.jsx
import React from 'react';
import { v4 as uuidv4 } from 'uuid';

export default function ExecutionsEditor({ executions = [], onChange }) {
  const add = () => onChange([...(executions||[]), { id: uuidv4(), date: new Date().toISOString().split('T')[0], time: new Date().toTimeString().slice(0,5), price:0, quantity:0, side:'entry' }]);
  const update = (id, patch) => onChange(executions.map(e => e.id === id ? { ...e, ...patch } : e));
  const remove = (id) => onChange(executions.filter(e => e.id !== id));

  return (
    <div style={{ marginTop: 10 }}>
      <h4>Executions</h4>
      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
        {(executions || []).map(e => (
          <div key={e.id} style={{ display:'flex', gap:8, alignItems:'center' }}>
            <input type="date" value={e.date} onChange={ev=>update(e.id, { date: ev.target.value })} />
            <input type="time" value={e.time} onChange={ev=>update(e.id, { time: ev.target.value })} />
            <input type="number" placeholder="price" value={e.price} onChange={ev=>update(e.id, { price: Number(ev.target.value) })}/>
            <input type="number" placeholder="qty" value={e.quantity} onChange={ev=>update(e.id, { quantity: Number(ev.target.value) })}/>
            <select value={e.side} onChange={ev=>update(e.id, { side: ev.target.value })}><option value="entry">entry</option><option value="exit">exit</option></select>
            <button className="btn ghost small" onClick={() => remove(e.id)}>X</button>
          </div>
        ))}
        <div>
          <button className="btn small" onClick={add}>+ Add Execution</button>
        </div>
      </div>
    </div>
  );
}
