import React, { useState, useEffect } from 'react';
import {
  getConnections,
  createConnection,
  deleteConnection,
  testConnection,
  discoverTables,
  getTableSchema,
  saveTableConfigs
} from '../services/api';

function Settings({ onClose, onConnectionSelect, activeConnectionId }) {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState(null);
  const [tables, setTables] = useState([]);
  const [selectedTables, setSelectedTables] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [form, setForm] = useState({
    name: '',
    host: 'localhost',
    port: 5432,
    database_name: '',
    username: 'postgres',
    password: ''
  });

  useEffect(() => {
    loadConnections();
  }, []);

  const loadConnections = async () => {
    try {
      setLoading(true);
      const data = await getConnections();
      setConnections(data.connections || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateConnection = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await createConnection(form);
      setShowForm(false);
      setForm({ name: '', host: 'localhost', port: 5432, database_name: '', username: 'postgres', password: '' });
      await loadConnections();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConnection = async (id) => {
    if (!confirm('Hapus koneksi ini?')) return;
    try {
      await deleteConnection(id);
      if (activeConnectionId === id) {
        onConnectionSelect(null);
      }
      await loadConnections();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleTestConnection = async (id) => {
    try {
      const result = await testConnection(id);
      alert(result.success ? '✅ Koneksi berhasil!' : `❌ Gagal: ${result.error}`);
    } catch (err) {
      alert(`❌ Error: ${err.message}`);
    }
  };

  const handleSelectConnection = async (conn) => {
    setSelectedConnection(conn);
    setTables([]);
    setSelectedTables(new Set());
    try {
      const data = await discoverTables(conn.id);
      setTables(data.tables || []);
      // Pre-select configured tables
      const configuredTables = data.tables.filter(t => t.configured).map(t => t.table_name);
      setSelectedTables(new Set(configuredTables));
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleTable = (tableName) => {
    const newSet = new Set(selectedTables);
    if (newSet.has(tableName)) {
      newSet.delete(tableName);
    } else {
      newSet.add(tableName);
    }
    setSelectedTables(newSet);
  };

  const handleSaveTables = async () => {
    if (!selectedConnection) return;
    setSaving(true);
    try {
      const tablesToSave = Array.from(selectedTables).map(name => ({
        table_name: name,
        is_active: true
      }));
      await saveTableConfigs(selectedConnection.id, tablesToSave);
      // Pass both ID and name to parent
      onConnectionSelect(selectedConnection.id, selectedConnection.name);
      alert('✅ Konfigurasi tabel berhasil disimpan!');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const styles = {
    overlay: {
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    },
    modal: {
      background: 'var(--bg-secondary)',
      borderRadius: '16px',
      width: '90%',
      maxWidth: '800px',
      maxHeight: '85vh',
      overflow: 'auto',
      border: '1px solid var(--border-color)'
    },
    header: {
      padding: '1.5rem',
      borderBottom: '1px solid var(--border-color)',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      position: 'sticky',
      top: 0,
      background: 'var(--bg-secondary)',
      zIndex: 10
    },
    body: {
      padding: '1.5rem'
    },
    grid: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '1.5rem'
    },
    card: {
      background: 'var(--bg-primary)',
      borderRadius: '12px',
      padding: '1rem',
      border: '1px solid var(--border-color)'
    },
    input: {
      width: '100%',
      padding: '0.75rem',
      borderRadius: '8px',
      border: '1px solid var(--border-color)',
      background: 'var(--bg-primary)',
      color: 'var(--text-primary)',
      marginBottom: '0.75rem'
    },
    button: {
      padding: '0.5rem 1rem',
      borderRadius: '8px',
      border: 'none',
      cursor: 'pointer',
      fontWeight: 500
    },
    buttonPrimary: {
      background: 'linear-gradient(135deg, #00d2ff, #3a7bd5)',
      color: 'white'
    },
    buttonSecondary: {
      background: 'var(--bg-primary)',
      color: 'var(--text-primary)',
      border: '1px solid var(--border-color)'
    },
    buttonDanger: {
      background: '#ff4757',
      color: 'white'
    },
    tableItem: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      padding: '0.5rem',
      borderRadius: '8px',
      cursor: 'pointer',
      transition: 'background 0.2s'
    },
    connItem: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '1rem',
      background: 'var(--bg-primary)',
      borderRadius: '8px',
      marginBottom: '0.75rem',
      border: '1px solid var(--border-color)'
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={{ margin: 0 }}>⚙️ Pengaturan Database</h2>
          <button 
            onClick={onClose}
            style={{ ...styles.button, ...styles.buttonSecondary }}
          >
            ✕ Tutup
          </button>
        </div>

        <div style={styles.body}>
          {error && (
            <div style={{ 
              padding: '1rem', 
              background: 'rgba(255,71,87,0.2)', 
              borderRadius: '8px',
              marginBottom: '1rem',
              color: '#ff4757'
            }}>
              {error}
            </div>
          )}

          <div style={styles.grid}>
            {/* Left: Connections List */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0 }}>Koneksi Database</h3>
                <button 
                  onClick={() => setShowForm(!showForm)}
                  style={{ ...styles.button, ...styles.buttonPrimary }}
                >
                  + Tambah
                </button>
              </div>

              {showForm && (
                <form onSubmit={handleCreateConnection} style={{ ...styles.card, marginBottom: '1rem' }}>
                  <input
                    style={styles.input}
                    placeholder="Nama koneksi"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    required
                  />
                  <input
                    style={styles.input}
                    placeholder="Host (localhost)"
                    value={form.host}
                    onChange={e => setForm({ ...form, host: e.target.value })}
                    required
                  />
                  <input
                    style={styles.input}
                    type="number"
                    placeholder="Port (5432)"
                    value={form.port}
                    onChange={e => setForm({ ...form, port: parseInt(e.target.value) })}
                    required
                  />
                  <input
                    style={styles.input}
                    placeholder="Nama Database"
                    value={form.database_name}
                    onChange={e => setForm({ ...form, database_name: e.target.value })}
                    required
                  />
                  <input
                    style={styles.input}
                    placeholder="Username"
                    value={form.username}
                    onChange={e => setForm({ ...form, username: e.target.value })}
                    required
                  />
                  <input
                    style={styles.input}
                    type="password"
                    placeholder="Password"
                    value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                    required
                  />
                  <button 
                    type="submit" 
                    style={{ ...styles.button, ...styles.buttonPrimary, width: '100%' }}
                    disabled={saving}
                  >
                    {saving ? 'Menyimpan...' : 'Simpan & Test Koneksi'}
                  </button>
                </form>
              )}

              {loading ? (
                <p>Memuat...</p>
              ) : connections.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)' }}>Belum ada koneksi. Tambah koneksi untuk memulai.</p>
              ) : (
                connections.map(conn => (
                  <div 
                    key={conn.id} 
                    style={{
                      ...styles.connItem,
                      borderColor: selectedConnection?.id === conn.id ? '#00d2ff' : 'var(--border-color)',
                      borderWidth: selectedConnection?.id === conn.id ? '2px' : '1px'
                    }}
                  >
                    <div 
                      style={{ flex: 1, cursor: 'pointer' }}
                      onClick={() => handleSelectConnection(conn)}
                    >
                      <div style={{ fontWeight: 600 }}>{conn.name}</div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {conn.host}:{conn.port}/{conn.database_name}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button 
                        onClick={() => handleTestConnection(conn.id)}
                        style={{ ...styles.button, ...styles.buttonSecondary, fontSize: '0.85rem' }}
                      >
                        Test
                      </button>
                      <button 
                        onClick={() => handleDeleteConnection(conn.id)}
                        style={{ ...styles.button, ...styles.buttonDanger, fontSize: '0.85rem' }}
                      >
                        Hapus
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Right: Table Selection */}
            <div>
              <h3 style={{ margin: '0 0 1rem' }}>
                {selectedConnection ? `Tabel: ${selectedConnection.name}` : 'Pilih Koneksi'}
              </h3>

              {selectedConnection ? (
                <>
                  {tables.length === 0 ? (
                    <p style={{ color: 'var(--text-secondary)' }}>Memuat tabel...</p>
                  ) : (
                    <>
                      <div style={{ ...styles.card, maxHeight: '400px', overflow: 'auto' }}>
                        {tables.map(t => (
                          <div 
                            key={t.table_name}
                            style={{
                              ...styles.tableItem,
                              background: selectedTables.has(t.table_name) ? 'rgba(0,210,255,0.15)' : 'transparent'
                            }}
                            onClick={() => toggleTable(t.table_name)}
                          >
                            <input 
                              type="checkbox" 
                              checked={selectedTables.has(t.table_name)}
                              readOnly
                            />
                            <span style={{ fontWeight: 500 }}>{t.table_name}</span>
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                              ({t.column_count} kolom)
                            </span>
                          </div>
                        ))}
                      </div>

                      <button 
                        onClick={handleSaveTables}
                        style={{ 
                          ...styles.button, 
                          ...styles.buttonPrimary, 
                          width: '100%', 
                          marginTop: '1rem',
                          padding: '1rem'
                        }}
                        disabled={saving || selectedTables.size === 0}
                      >
                        {saving ? 'Menyimpan...' : `💾 Simpan & Gunakan (${selectedTables.size} tabel)`}
                      </button>
                    </>
                  )}
                </>
              ) : (
                <p style={{ color: 'var(--text-secondary)' }}>
                  Klik koneksi database untuk melihat dan memilih tabel yang ingin diakses oleh AI.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Settings;
