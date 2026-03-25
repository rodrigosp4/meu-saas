import axios from 'axios';
async function test() {
  try {
    const { data } = await axios.get("https://api.mercadolibre.com/user-products/MLBU729375488");
    console.log(data);
  } catch(e) { console.error(e.message) }
}
test();
