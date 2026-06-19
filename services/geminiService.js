const GEMINI_MODEL = 'gemini-2.5-flash';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

/**
 * Extracts delivery items from an invoice file (PDF/Image) using the Gemini API.
 * Maps extracted items to the list of known raw ingredient names.
 */
async function extractInvoice(fileBuffer, mimeType, rawIngredients = []) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in the environment variables.');
  }

  const base64Data = fileBuffer.toString('base64');
  const ingredientsListStr = rawIngredients.map(ing => `"${ing.name}" (ID: ${ing._id})`).join(', ');

  const prompt = `
You are an expert invoice processing assistant for a restaurant.
Analyze this invoice document and extract all delivery items/ingredients received.
For each item, extract:
1. The description or name of the item.
2. The quantity received.
3. The unit price / price per unit.

CRITICAL INSTRUCTION:
Match each extracted item to one of our restaurant's raw ingredients listed below:
[ ${ingredientsListStr} ]

If an item matches one of these ingredients, provide its ID in the "rawItemId" field.
If it does not match any ingredient in our database, leave "rawItemId" null.

Your response must be a valid JSON object matching the following structure:
{
  "deliveries": [
    {
      "name": "Extracted Item Name",
      "quantity": 10,
      "price": 5.50,
      "rawItemId": "matched_ingredient_id_or_null"
    }
  ]
}
Do not return any markdown code blocks, comments, or extra text. Return ONLY the raw JSON.
`;

  const requestBody = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data
            }
          }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: 'application/json'
    }
  };

  try {
    const response = await fetch(`${API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API returned error: ${response.status} - ${errorText}`);
    }

    const resJson = await response.json();
    const resultText = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!resultText) {
      throw new Error('Gemini did not return any content.');
    }

    return JSON.parse(resultText);
  } catch (err) {
    console.error('Gemini invoice extraction failed:', err);
    throw err;
  }
}

/**
 * Extracts POS sales data from a sales report file using the Gemini API.
 */
async function extractSalesReport(fileBuffer, mimeType) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in the environment variables.');
  }

  const base64Data = fileBuffer.toString('base64');

  const prompt = `
You are an expert sales report parsing assistant for a restaurant.
Analyze this sales report and extract the total quantities sold for all menu items.
For each item, extract:
1. Item Name / Description
2. SKU (if available, otherwise leave empty)
3. Quantity Sold
4. Sales Price (or unit price)

Your response must be a valid JSON object matching the following structure:
{
  "sales": [
    {
      "name": "Item Name",
      "sku": "SKU123_or_empty",
      "quantitySold": 5,
      "price": 12.99
    }
  ]
}
Do not return any markdown code blocks, comments, or extra text. Return ONLY the raw JSON.
`;

  const requestBody = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data
            }
          }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: 'application/json'
    }
  };

  try {
    const response = await fetch(`${API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API returned error: ${response.status} - ${errorText}`);
    }

    const resJson = await response.json();
    const resultText = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!resultText) {
      throw new Error('Gemini did not return any content.');
    }

    return JSON.parse(resultText);
  } catch (err) {
    console.error('Gemini sales report extraction failed:', err);
    throw err;
  }
}

module.exports = {
  extractInvoice,
  extractSalesReport
};
