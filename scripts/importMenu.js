const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const connectDB = require('../config/db');
const MenuItem = require('../models/MenuItem');

const CSV_PATH = '/Users/Janvi/Desktop/Chucks_Inventory/chucks_menu_final_products.csv';

const importMenu = async () => {
  console.log('Connecting to database...');
  await connectDB();

  console.log('Clearing existing Menu Items...');
  await MenuItem.deleteMany({});

  console.log(`Reading and parsing CSV from ${CSV_PATH}...`);
  const results = [];
  let totalCount = 0;

  fs.createReadStream(CSV_PATH)
    .pipe(csv())
    .on('data', (data) => {
      // Find rows where sku exists and name exists
      const sku = (data.item_sku_code || '').trim();
      const name = (data.name || '').trim();
      const category = (data.category_name || '').trim();
      const subcat = (data.subcat_name || '').trim();
      const type = (data.type || '').trim();

      if (sku && name) {
        results.push({
          item_sku_code: sku,
          name: name,
          category_name: category,
          subcat_name: subcat,
          type: type
        });
      }
    })
    .on('end', async () => {
      console.log(`Parsed ${results.length} menu products. Committing to database in batches...`);
      
      const batchSize = 1000;
      for (let i = 0; i < results.length; i += batchSize) {
        const batch = results.slice(i, i + batchSize);
        try {
          await MenuItem.insertMany(batch);
          totalCount += batch.length;
          console.log(`Inserted batch ${i / batchSize + 1} (${totalCount}/${results.length})`);
        } catch (err) {
          console.error(`Error inserting batch starting at index ${i}:`, err.message);
        }
      }

      console.log(`Menu import complete! Successfully imported ${totalCount} records.`);
      process.exit(0);
    })
    .on('error', (error) => {
      console.error('Error reading CSV:', error.message);
      process.exit(1);
    });
};

importMenu();
