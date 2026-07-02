import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Plus, Trash2, Building2, Layers3 } from "lucide-react";
import api from "../api/client";
import type { Block, Campus, Floor } from "../types";

export default function CampusStructure() {
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [selectedBlock, setSelectedBlock] = useState<number | null>(null);

  const [campusForm, setCampusForm] = useState({ name: "", address: "" });
  const [blockForm, setBlockForm] = useState({ name: "", code: "", campus: "" });
  const [floorForm, setFloorForm] = useState({ block: "", number: "", name: "" });

  const [showCampusForm, setShowCampusForm] = useState(false);
  const [showBlockForm, setShowBlockForm] = useState(false);
  const [showFloorForm, setShowFloorForm] = useState(false);

  const loadAll = async () => {
    try {
      const [campusRes, blocksRes, floorsRes] = await Promise.all([
        api.get("/campus/campuses/"),
        api.get("/campus/blocks/"),
        api.get("/campus/floors/"),
      ]);
      setCampuses(campusRes.data.results ?? campusRes.data);
      setBlocks(blocksRes.data.results ?? blocksRes.data);
      setFloors(floorsRes.data.results ?? floorsRes.data);
    } catch (error) {
      console.error("CampusStructure load failed", error);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  useEffect(() => {
    if (selectedBlock) {
      setFloorForm((current) => ({ ...current, block: String(selectedBlock) }));
    }
  }, [selectedBlock]);

  const submitCampus = async (e: FormEvent) => {
    e.preventDefault();
    await api.post("/campus/campuses/", campusForm);
    setCampusForm({ name: "", address: "" });
    setShowCampusForm(false);
    loadAll();
  };

  const submitBlock = async (e: FormEvent) => {
    e.preventDefault();
    await api.post("/campus/blocks/", { ...blockForm, campus: Number(blockForm.campus) });
    setBlockForm({ name: "", code: "", campus: "" });
    setShowBlockForm(false);
    loadAll();
  };

  const submitFloor = async (e: FormEvent) => {
    e.preventDefault();
    if (!floorForm.block) return;
    await api.post("/campus/floors/", { ...floorForm, number: Number(floorForm.number), block: Number(floorForm.block) });
    setFloorForm({ block: "", number: "", name: "" });
    setShowFloorForm(false);
    loadAll();
  };

  const deleteItem = async (url: string) => {
    if (!confirm("Delete this item? This will also remove everything inside it.")) return;
    await api.delete(url);
    loadAll();
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Campus Structure</h1>
          <p className="mt-1 text-sm text-slate-500">Configure campuses, blocks, and floors.</p>
        </div>
      </div>

      {/* Campuses */}
      <section className="card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-800">
            <Building2 size={18} className="text-brand-600" /> Campuses
          </h2>
          <button className="btn-secondary" onClick={() => setShowCampusForm((s) => !s)}>
            <Plus size={16} /> Add Campus
          </button>
        </div>
        {showCampusForm && (
          <form onSubmit={submitCampus} className="mb-4 grid grid-cols-1 gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-3">
            <input className="input" required placeholder="Campus name" value={campusForm.name} onChange={(e) => setCampusForm({ ...campusForm, name: e.target.value })} />
            <input className="input" placeholder="Address (optional)" value={campusForm.address} onChange={(e) => setCampusForm({ ...campusForm, address: e.target.value })} />
            <button className="btn-primary">Save</button>
          </form>
        )}
        <div className="flex flex-wrap gap-2">
          {campuses.map((c) => (
            <span key={c.id} className="badge bg-slate-100 text-slate-700">{c.name}</span>
          ))}
          {campuses.length === 0 && <p className="text-sm text-slate-400">No campuses yet.</p>}
        </div>
      </section>

      {/* Blocks */}
      <section className="card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-800">
            <Layers3 size={18} className="text-brand-600" /> Blocks
          </h2>
          <button className="btn-secondary" onClick={() => setShowBlockForm((s) => !s)}>
            <Plus size={16} /> Add Block
          </button>
        </div>
        {showBlockForm && (
          <form onSubmit={submitBlock} className="mb-4 grid grid-cols-1 gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-4">
            <select className="input" required value={blockForm.campus} onChange={(e) => setBlockForm({ ...blockForm, campus: e.target.value })}>
              <option value="">Select campus</option>
              {campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input className="input" required placeholder="Block name (e.g. Block A)" value={blockForm.name} onChange={(e) => setBlockForm({ ...blockForm, name: e.target.value })} />
            <input className="input" placeholder="Code (e.g. A)" value={blockForm.code} onChange={(e) => setBlockForm({ ...blockForm, code: e.target.value })} />
            <button className="btn-primary">Save</button>
          </form>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {blocks.map((b) => (
            <button
              key={b.id}
              onClick={() => setSelectedBlock(b.id)}
              className={`flex items-center justify-between rounded-xl border p-3.5 text-left transition ${
                selectedBlock === b.id ? "border-brand-400 bg-brand-50" : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <div>
                <p className="text-sm font-semibold text-slate-800">{b.name}</p>
                <p className="text-xs text-slate-500">{b.campus_name}</p>
              </div>
              <Trash2
                size={15}
                className="text-slate-300 hover:text-rose-500"
                onClick={(e) => { e.stopPropagation(); deleteItem(`/campus/blocks/${b.id}/`); }}
              />
            </button>
          ))}
          {blocks.length === 0 && <p className="text-sm text-slate-400">No blocks yet.</p>}
        </div>
      </section>

      {/* Floors */}
      <section className="card p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Floors</h2>
            <p className="text-sm text-slate-500">Saved floors appear below, with their block names.</p>
          </div>
          <button
            className="btn-secondary"
            disabled={!blocks.length}
            onClick={() => setShowFloorForm((s) => !s)}
          >
            <Plus size={16} /> Add Floor
          </button>
        </div>
        {showFloorForm && (
          <form onSubmit={submitFloor} className="mb-4 grid grid-cols-1 gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-3">
            <select className="input" required value={floorForm.block} onChange={(e) => setFloorForm({ ...floorForm, block: e.target.value })}>
              <option value="">Select block</option>
              {blocks.map((b) => (
                <option key={b.id} value={b.id}>{b.campus_name} — {b.name}</option>
              ))}
            </select>
            <input className="input" type="number" required placeholder="Floor number (e.g. 1)" value={floorForm.number} onChange={(e) => setFloorForm({ ...floorForm, number: e.target.value })} />
            <input className="input" placeholder="Display name (optional)" value={floorForm.name} onChange={(e) => setFloorForm({ ...floorForm, name: e.target.value })} />
            <button className="btn-primary">Save</button>
          </form>
        )}
        <div className="grid grid-cols-1 gap-3">
          {floors.length === 0 ? (
            <p className="text-sm text-slate-400">No floors yet. Add one above to see it here.</p>
          ) : (
            floors.map((f) => (
              <div key={f.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div>
                  <p className="font-semibold text-slate-800">{f.name || `Floor ${f.number}`}</p>
                  <p className="text-xs text-slate-500">{f.block_name}</p>
                </div>
                <Trash2 size={16} className="cursor-pointer text-slate-400 hover:text-rose-500" onClick={() => deleteItem(`/campus/floors/${f.id}/`)} />
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
