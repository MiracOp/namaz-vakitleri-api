const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
  const response = await axios.get('https://www.sabah.com.tr/istanbul-namaz-vakitleri');
  const $ = cheerio.load(response.data);
  
  console.log('Vakitler HTML kontrolü:');
  $('.vakitler ul li').each((index, element) => {
    const label = $(element).find('strong').text().trim();
    const time = $(element).find('span').text().trim();
    console.log(`${index}: Label="${label}", Time="${time}"`);
  });
}

test();
