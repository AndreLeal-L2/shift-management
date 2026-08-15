const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Helper function para validar token
async function validateToken(token) {
  if (!token) return null;
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data, error } = await supabase.auth.getUser(token);
  
  if (error || !data.user) {
    return null;
  }
  
  return data.user;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Validar token
  const token = req.headers.authorization?.replace('Bearer ', '');
  const user = await validateToken(token);
  
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        }
      }
    });

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const { name, role, maxHours, max_hours, availability } = req.body || {};
      const hours = maxHours !== undefined ? maxHours : max_hours;
      const { data, error } = await supabase
        .from('employees')
        .insert([{ name, role, max_hours: hours, availability }])
        .select();

      if (error) throw error;
      return res.status(201).json(data[0]);
    }

    if (req.method === 'PUT') {
      const { id, name, role, maxHours, max_hours, availability } = req.body || {};
      const hours = maxHours !== undefined ? maxHours : max_hours;
      const { data, error } = await supabase
        .from('employees')
        .update({ name, role, max_hours: hours, availability, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select();

      if (error) throw error;
      return res.status(200).json(data[0]);
    }

    if (req.method === 'DELETE') {
      let id = req.query?.id;
      if (!id && req.url) {
        try {
          const urlObj = new URL(req.url, 'http://localhost');
          id = urlObj.searchParams.get('id');
        } catch (e) {}
      }
      if (!id) {
        return res.status(400).json({ error: 'Missing employee id' });
      }
      const { error } = await supabase
        .from('employees')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return res.status(204).end();
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: error.message });
  }
};