const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://nwcooqowjnwaiylahyei.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53Y29vcW93am53YWl5bGFoeWVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjczNzA4NjksImV4cCI6MjA4Mjk0Njg2OX0.6m4p6YeZsXwq3N7_QZkvvUVlcqYZqNkY2S77Z-iBZjc';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function check() {
  const { data, error } = await supabase.from('app_data').select('*').limit(1);
  console.log(error || Object.keys(data[0] || {}));
}
check();