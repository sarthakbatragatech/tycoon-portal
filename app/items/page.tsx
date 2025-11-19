// @ts-nocheck
"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type UIItem = {
  id: string;
  name: string;
  category: string;
  unit: string;
  is_active: boolean;
  dealer_rate: string; // stored as string for nice editing
};

const CATEGORY_OPTIONS = ["jeep", "bike", "car", "scooter", "spare"];

export default function ItemsPage() {
  const [items, setItems] = useState<UIItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingItemId, setSavingItemId] = useState<string | null>(null);

  // New item form state
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("jeep");
  const [newRate, setNewRate] = useState("");
  const [newUnit, setNewUnit] = useState("pcs");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    loadItems();
  }, []);

  async function loadItems() {
    setLoading(true);

    const { data, error } = await supabase
      .from("items")
      .select("id, name, category, dealer_rate, unit, is_active")
      .order("name");

    if (error) {
      console.error("Error loading items", error);
      setItems([]);
    } else {
      const mapped: UIItem[] = (data || []).map((i: any) => ({
        id: i.id,
        name: i.name,
        category: i.category,
        unit: i.unit || "pcs",
        is_active: i.is_active ?? true,
        dealer_rate:
          i.dealer_rate !== null && i.dealer_rate !== undefined
            ? String(i.dealer_rate)
            : "",
      }));
      setItems(mapped);
    }

    setLoading(false);
  }

  function updateItemRate(id: string, value: string) {
    setItems((prev) =>
      prev.map((it) =>
        it.id === id ? { ...it, dealer_rate: value.replace(/[^\d.]/g, "") } : it
      )
    );
  }

  async function toggleActive(id: string, current: boolean) {
    setSavingItemId(id);

    const { error } = await supabase
      .from("items")
      .update({ is_active: !current })
      .eq("id", id);

    if (error) {
      console.error("Error toggling active", error);
      alert("Error updating item: " + error.message);
      setSavingItemId(null);
      return;
    }

    setItems((prev) =>
      prev.map((it) =>
        it.id === id ? { ...it, is_active: !current } : it
      )
    );

    setSavingItemId(null);
  }

  async function saveRate(id: string) {
    const item = items.find((i) => i.id === id);
    if (!item) return;

    const rateStr = item.dealer_rate.trim();
    if (rateStr === "") {
      alert("Dealer rate cannot be empty.");
      return;
    }

    const rateNum = Number(rateStr);
    if (Number.isNaN(rateNum) || rateNum < 0) {
      alert("Please enter a valid rate.");
      return;
    }

    setSavingItemId(id);

    const { error } = await supabase
      .from("items")
      .update({ dealer_rate: rateNum })
      .eq("id", id);

    if (error) {
      console.error("Error saving rate", error);
      alert("Error saving rate: " + error.message);
      setSavingItemId(null);
      return;
    }

    setSavingItemId(null);
  }

  async function addNewItem() {
    if (!newName.trim()) {
      alert("Item name is required.");
      return;
    }

    if (!newRate.trim()) {
      alert("Dealer rate is required.");
      return;
    }

    const rateNum = Number(newRate.trim());
    if (Number.isNaN(rateNum) || rateNum < 0) {
      alert("Please enter a valid dealer rate.");
      return;
    }

    setAdding(true);

    const { data, error } = await supabase
      .from("items")
      .insert([
        {
          name: newName.trim(),
          category: newCategory,
          dealer_rate: rateNum,
          unit: newUnit.trim() || "pcs",
          is_active: true,
        },
      ])
      .select("id, name, category, dealer_rate, unit, is_active")
      .single();

    if (error) {
      console.error("Error adding item", error);
      alert("Error adding item: " + error.message);
      setAdding(false);
      return;
    }

    const newItem: UIItem = {
      id: data.id,
      name: data.name,
      category: data.category,
      unit: data.unit || "pcs",
      is_active: data.is_active ?? true,
      dealer_rate:
        data.dealer_rate !== null && data.dealer_rate !== undefined
          ? String(data.dealer_rate)
          : "",
    };

    setItems((prev) => [...prev, newItem]);

    // Clear form
    setNewName("");
    setNewCategory("jeep");
    setNewRate("");
    setNewUnit("pcs");
    setAdding(false);
  }

  return (
    <>
      <h1 className="section-title">Items</h1>
      <p className="section-subtitle">
        Manage Tycoon items · dealer rates · active / inactive.
      </p>

      {/* ADD NEW ITEM */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-label" style={{ marginBottom: 8 }}>
          Add New Item
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1.2fr 1.2fr 1fr auto",
            gap: 8,
            alignItems: "center",
          }}
        >
          <input
            type="text"
            placeholder="Item name (e.g. FR-900 WL)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            style={{
              width: "100%",
              padding: "6px 8px",
              borderRadius: 999,
              border: "1px solid #333",
              background: "#050505",
              color: "#f5f5f5",
              fontSize: 12,
            }}
          />

          <select
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            style={{
              width: "100%",
              padding: "6px 8px",
              borderRadius: 999,
              border: "1px solid #333",
              background: "#050505",
              color: "#f5f5f5",
              fontSize: 12,
            }}
          >
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <input
            type="text"
            inputMode="numeric"
            placeholder="Dealer rate"
            value={newRate}
            onChange={(e) =>
              setNewRate(e.target.value.replace(/[^\d.]/g, ""))
            }
            style={{
              width: "100%",
              padding: "6px 8px",
              borderRadius: 999,
              border: "1px solid #333",
              background: "#050505",
              color: "#f5f5f5",
              fontSize: 12,
            }}
          />

          <input
            type="text"
            placeholder="Unit"
            value={newUnit}
            onChange={(e) => setNewUnit(e.target.value)}
            style={{
              width: "100%",
              padding: "6px 8px",
              borderRadius: 999,
              border: "1px solid #333",
              background: "#050505",
              color: "#f5f5f5",
              fontSize: 12,
            }}
          />

          <button
            type="button"
            className="pill-button"
            onClick={addNewItem}
            disabled={adding}
          >
            {adding ? "Adding…" : "Add item"}
          </button>
        </div>
      </div>

      {/* EXISTING ITEMS TABLE */}
      <div className="table-wrapper">
        <div className="table-header">
          <div className="table-title">All Items</div>
          <div className="table-filters">
            {loading
              ? "Loading..."
              : items.length === 0
              ? "No items yet"
              : `Showing ${items.length} items`}
          </div>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th style={{ width: "26%" }}>Name</th>
              <th>Category</th>
              <th>Dealer Rate</th>
              <th>Unit</th>
              <th>Active</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id}>
                <td>{it.name}</td>
                <td>{it.category}</td>
                <td>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={it.dealer_rate}
                    onChange={(e) =>
                      updateItemRate(it.id, e.target.value)
                    }
                    style={{
                      width: 90,
                      padding: "4px 8px",
                      borderRadius: 999,
                      border: "1px solid #333",
                      background: "#050505",
                      color: "#f5f5f5",
                      fontSize: 12,
                    }}
                  />
                </td>
                <td>{it.unit || "pcs"}</td>
                <td>
                  <button
                    type="button"
                    onClick={() => toggleActive(it.id, it.is_active)}
                    disabled={savingItemId === it.id}
                    style={{
                      padding: "3px 10px",
                      borderRadius: 999,
                      border: "1px solid #333",
                      background: it.is_active ? "#16a34a" : "transparent",
                      color: it.is_active ? "#000" : "#f5f5f5",
                      fontSize: 11,
                    }}
                  >
                    {it.is_active ? "Active" : "Inactive"}
                  </button>
                </td>
                <td>
                  <button
                    type="button"
                    onClick={() => saveRate(it.id)}
                    disabled={savingItemId === it.id}
                    style={{
                      padding: "4px 12px",
                      borderRadius: 999,
                      border: "1px solid #fff",
                      background: "transparent",
                      color: "#fff",
                      fontSize: 11,
                    }}
                  >
                    {savingItemId === it.id ? "Saving…" : "Save"}
                  </button>
                </td>
              </tr>
            ))}

            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", padding: 12 }}>
                  No items yet. Add your first item above.
                </td>
              </tr>
            )}

            {loading && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", padding: 12 }}>
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}