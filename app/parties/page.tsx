// @ts-nocheck
"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type UIParty = {
  id: string;
  name: string;
  city: string;
  gstin: string;
  contact_person: string;
  phone: string;
  credit_days: string; // keep as string for easy editing
  is_active: boolean;
};

export default function PartiesPage() {
  const [parties, setParties] = useState<UIParty[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingPartyId, setSavingPartyId] = useState<string | null>(null);

  // New party form
  const [newName, setNewName] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newCreditDays, setNewCreditDays] = useState("");
  const [newGstin, setNewGstin] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    loadParties();
  }, []);

  async function loadParties() {
    setLoading(true);

    const { data, error } = await supabase
      .from("parties")
      .select(
        "id, name, city, gstin, contact_person, phone, credit_days, is_active"
      )
      .order("name");

    if (error) {
      console.error("Error loading parties", error);
      setParties([]);
    } else {
      const mapped: UIParty[] = (data || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        city: p.city || "",
        gstin: p.gstin || "",
        contact_person: p.contact_person || "",
        phone: p.phone || "",
        credit_days:
          p.credit_days !== null && p.credit_days !== undefined
            ? String(p.credit_days)
            : "",
        is_active: p.is_active ?? true,
      }));
      setParties(mapped);
    }

    setLoading(false);
  }

  function updatePartyField(
    id: string,
    field: keyof UIParty,
    value: string
  ) {
    setParties((prev) =>
      prev.map((pt) =>
        pt.id === id ? { ...pt, [field]: value } : pt
      )
    );
  }

  async function toggleActive(id: string, current: boolean) {
    setSavingPartyId(id);

    const { error } = await supabase
      .from("parties")
      .update({ is_active: !current })
      .eq("id", id);

    if (error) {
      console.error("Error toggling active", error);
      alert("Error updating party: " + error.message);
      setSavingPartyId(null);
      return;
    }

    setParties((prev) =>
      prev.map((pt) =>
        pt.id === id ? { ...pt, is_active: !current } : pt
      )
    );

    setSavingPartyId(null);
  }

  async function saveParty(id: string) {
    const party = parties.find((p) => p.id === id);
    if (!party) return;

    const creditDaysStr = party.credit_days.trim();
    let creditDaysNum: number | null = null;

    if (creditDaysStr !== "") {
      const n = Number(creditDaysStr);
      if (Number.isNaN(n) || n < 0) {
        alert("Please enter a valid credit days value (or leave blank).");
        return;
      }
      creditDaysNum = n;
    }

    setSavingPartyId(id);

    const { error } = await supabase
      .from("parties")
      .update({
        name: party.name.trim(),
        city: party.city.trim() || null,
        gstin: party.gstin.trim() || null,
        contact_person: party.contact_person.trim() || null,
        phone: party.phone.trim() || null,
        credit_days: creditDaysNum,
      })
      .eq("id", id);

    if (error) {
      console.error("Error saving party", error);
      alert("Error saving party: " + error.message);
      setSavingPartyId(null);
      return;
    }

    setSavingPartyId(null);
  }

  async function addNewParty() {
    if (!newName.trim()) {
      alert("Party name is required.");
      return;
    }

    let creditDaysNum: number | null = null;
    if (newCreditDays.trim() !== "") {
      const n = Number(newCreditDays.trim());
      if (Number.isNaN(n) || n < 0) {
        alert("Please enter a valid credit days value (or leave blank).");
        return;
      }
      creditDaysNum = n;
    }

    setAdding(true);

    const { data, error } = await supabase
      .from("parties")
      .insert([
        {
          name: newName.trim(),
          city: newCity.trim() || null,
          gstin: newGstin.trim() || null,
          contact_person: null,
          phone: newPhone.trim() || null,
          credit_days: creditDaysNum,
          is_active: true,
        },
      ])
      .select(
        "id, name, city, gstin, contact_person, phone, credit_days, is_active"
      )
      .single();

    if (error) {
      console.error("Error adding party", error);
      alert("Error adding party: " + error.message);
      setAdding(false);
      return;
    }

    const newParty: UIParty = {
      id: data.id,
      name: data.name,
      city: data.city || "",
      gstin: data.gstin || "",
      contact_person: data.contact_person || "",
      phone: data.phone || "",
      credit_days:
        data.credit_days !== null && data.credit_days !== undefined
          ? String(data.credit_days)
          : "",
      is_active: data.is_active ?? true,
    };

    setParties((prev) => [...prev, newParty]);

    // Clear form
    setNewName("");
    setNewCity("");
    setNewPhone("");
    setNewCreditDays("");
    setNewGstin("");
    setAdding(false);
  }

  return (
    <>
      <h1 className="section-title">Parties</h1>
      <p className="section-subtitle">
        Manage Tycoon customers · cities · phones · credit days · active / inactive.
      </p>

      {/* ADD NEW PARTY */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-label" style={{ marginBottom: 8 }}>
          Add New Party
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1.2fr 1.2fr 1fr 1.5fr auto",
            gap: 8,
            alignItems: "center",
          }}
        >
          <input
            type="text"
            placeholder="Party name"
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

          <input
            type="text"
            placeholder="City"
            value={newCity}
            onChange={(e) => setNewCity(e.target.value)}
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
            placeholder="Phone"
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
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
            inputMode="numeric"
            placeholder="Credit days"
            value={newCreditDays}
            onChange={(e) =>
              setNewCreditDays(e.target.value.replace(/[^\d]/g, ""))
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
            placeholder="GSTIN (optional)"
            value={newGstin}
            onChange={(e) => setNewGstin(e.target.value)}
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
            onClick={addNewParty}
            disabled={adding}
          >
            {adding ? "Adding…" : "Add party"}
          </button>
        </div>
      </div>

      {/* EXISTING PARTIES */}
      <div className="table-wrapper">
        <div className="table-header">
          <div className="table-title">All Parties</div>
          <div className="table-filters">
            {loading
              ? "Loading..."
              : parties.length === 0
              ? "No parties yet"
              : `Showing ${parties.length} parties`}
          </div>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th style={{ width: "22%" }}>Name</th>
              <th>City</th>
              <th>Phone</th>
              <th>Credit days</th>
              <th>GSTIN</th>
              <th>Active</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {parties.map((pt) => (
              <tr key={pt.id}>
                <td>{pt.name}</td>
                <td>
                  <input
                    type="text"
                    value={pt.city}
                    onChange={(e) =>
                      updatePartyField(pt.id, "city", e.target.value)
                    }
                    style={{
                      width: "100%",
                      padding: "4px 8px",
                      borderRadius: 999,
                      border: "1px solid #333",
                      background: "#050505",
                      color: "#f5f5f5",
                      fontSize: 12,
                    }}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={pt.phone}
                    onChange={(e) =>
                      updatePartyField(pt.id, "phone", e.target.value)
                    }
                    style={{
                      width: "100%",
                      padding: "4px 8px",
                      borderRadius: 999,
                      border: "1px solid #333",
                      background: "#050505",
                      color: "#f5f5f5",
                      fontSize: 12,
                    }}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={pt.credit_days}
                    onChange={(e) =>
                      updatePartyField(
                        pt.id,
                        "credit_days",
                        e.target.value.replace(/[^\d]/g, "")
                      )
                    }
                    style={{
                      width: 70,
                      padding: "4px 8px",
                      borderRadius: 999,
                      border: "1px solid #333",
                      background: "#050505",
                      color: "#f5f5f5",
                      fontSize: 12,
                    }}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={pt.gstin}
                    onChange={(e) =>
                      updatePartyField(pt.id, "gstin", e.target.value)
                    }
                    style={{
                      width: "100%",
                      padding: "4px 8px",
                      borderRadius: 999,
                      border: "1px solid #333",
                      background: "#050505",
                      color: "#f5f5f5",
                      fontSize: 12,
                    }}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    onClick={() => toggleActive(pt.id, pt.is_active)}
                    disabled={savingPartyId === pt.id}
                    style={{
                      padding: "3px 10px",
                      borderRadius: 999,
                      border: "1px solid #333",
                      background: pt.is_active ? "#16a34a" : "transparent",
                      color: pt.is_active ? "#000" : "#f5f5f5",
                      fontSize: 11,
                    }}
                  >
                    {pt.is_active ? "Active" : "Inactive"}
                  </button>
                </td>
                <td>
                  <button
                    type="button"
                    onClick={() => saveParty(pt.id)}
                    disabled={savingPartyId === pt.id}
                    style={{
                      padding: "4px 12px",
                      borderRadius: 999,
                      border: "1px solid #fff",
                      background: "transparent",
                      color: "#fff",
                      fontSize: 11,
                    }}
                  >
                    {savingPartyId === pt.id ? "Saving…" : "Save"}
                  </button>
                </td>
              </tr>
            ))}

            {!loading && parties.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: 12 }}>
                  No parties yet. Add your first party above.
                </td>
              </tr>
            )}

            {loading && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: 12 }}>
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