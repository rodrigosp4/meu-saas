import prisma from './backend/src/config/prisma.js';
import axios from 'axios';

async function test() {
  const conta = await prisma.contaML.findFirst();
  if (!conta) {
    console.log('No accounts found');
    return;
  }
  
  try {
    const searchRes = await axios.get(`https://api.mercadolibre.com/products/search?status=active&site_id=MLB&q=Transmissor%20Video%20Hdmi%20Wireless`, {
      headers: { Authorization: `Bearer ${conta.accessToken}` }
    });
    
    console.log(JSON.stringify(searchRes.data.results[0], null, 2));
  } catch (err) {
    console.error(err.response?.data || err.message);
  } finally {
    await prisma.$disconnect();
  }
}

test();
