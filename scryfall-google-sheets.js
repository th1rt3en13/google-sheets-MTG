// this function is available here:
// https://github.com/scryfall/google-sheets/blob/main/scryfall-google-sheets.js
// and here https://github.com/th1rt3en13/google-sheets-MTG 

const MAX_RESULTS_ = 700;  // um máximo seguro devido ao sistema de timeout do Google Sheets

/**
 * Insere os resultados de uma busca na Scryfall na sua planilha
 *
 * @param {"name:braids type:legendary"}  query       Consulta de busca na Scryfall
 * @param {"name power toughness"}        fields      Lista de campos para retornar da Scryfall, "name" é o padrão
 * @param {150}                           num_results Número de resultados (padrão 150, máximo 700)
 * @param {name}                          order       A ordem para classificar as cartas, "name" é o padrão
 * @param {auto}                          dir         Direção para retornar as cartas classificadas: auto, asc, ou desc 
 * @param {cards}                         unique      Remove cartas duplicadas (padrão), art, ou prints
 * @return                                Lista de resultados da pesquisa da Scryfall
 * @customfunction
 */
const SCRYFALL = (query, fields = "name", num_results = 150,
                  order = "name", dir = "auto", unique = "cards") => {
  if (query === undefined) { 
    throw new Error("Deve incluir uma consulta");
  }

  // não quebrar a Scryfall
  if (num_results > MAX_RESULTS_) {
    num_results = MAX_RESULTS_;
  }

  // os documentos dizem que os campos são separados por espaço, mas permitem também por vírgula
  fields = fields.split(/[\s,]+/);

  // Mapeamento de campos amigáveis
  const field_mappings = {
    "color": "color_identity",
    "colors": "color_identity",
    "flavor": "flavor_text",
    "mana": "mana_cost",
    "o": "oracle_text",
    "oracle": "oracle_text",
    "price": "prices.usd",
    "type": "type_line",
    "uri": "scryfall_uri",
    "url": "scryfall_uri",
  };

  // Mapeamento de opções de ordenação
  const order_mappings = {
    "price": "usd",
    "prices.eur": "eur",
    "prices.usd": "usd",
  };

  fields = fields.map(field => field_mappings[field] === undefined ? field : field_mappings[field]);
  order = order_mappings[order] === undefined ? order : order_mappings[order];

  // consulta à Scryfall
  const cards = scryfallSearch_(query, num_results, order, dir, unique);

  // acumula os resultados
  let output = [];

  cards.splice(0, num_results).forEach(card => {
    let row = [];

    // lida com faces de cartas
    if ("card_faces" in card) {
      Object.assign(card, card["card_faces"][0]);
    }

    // insere imagem
    card["image"] = `=IMAGE("${card["image_uris"]["normal"]}", 4, 340, 244)`;

    fields.forEach(field => {
      // pega o valor do campo dos dados da carta
      let val = deepFind_(card, field) || "";

      // Processa o campo legalities
      if (field === "legalities") {
        // Formatos que você deseja exibir
        const formatosDesejados = ["commander", "pioneer"]; // ajuste aqui os formatos desejados
        val = mostrarLegalidades(val, formatosDesejados);
      }

      // Manipulação de dados para Google Sheets
      if (typeof val === "string") {
        val = val.replace(/\n/g, "\n\n");  // Espaçamento para legibilidade
      } else if (Array.isArray(val)) {
        val = field.includes("color") ? val.join("") : val.join(", ");
      }

      row.push(val);
    });

    // Suponha que este seja o preço da carta em dólar retornado pela API
    let precoCartaDolar = deepFind_(card, "prices.usd") || 0; // Pega o preço em dólares da carta
    let cotacaoDolarBRL = getCotacaoDolar(); // Função que obtém a cotação atual

    // Cálculo do preço em real
    let precoCartaReal = precoCartaDolar * cotacaoDolarBRL;

    row.push(precoCartaReal); // Adiciona o preço em reais à linha de saída
    output.push(row);
  });

  return output;
};

// Função para buscar legalidades específicas
const mostrarLegalidades = (val, formatosDesejados) => {
  const resultados = formatosDesejados.map(format => {
    const status = val[format] || "unknown";  // Pega o status ou "unknown"
    return `${format.charAt(0).toUpperCase() + format.slice(1)}: ${status}`;  // Formata a saída
  });

  return resultados.join("\n");  // Junta os resultados em uma string
};

// Função para obter a cotação do dólar
function getCotacaoDolar() {
  const url = "https://api.exchangerate-api.com/v4/latest/USD"; // URL da API de cotação
  const response = UrlFetchApp.fetch(url);
  const data = JSON.parse(response.getContentText());
  return data.rates.BRL; // Retorna a cotação do dólar para o real
}

const deepFind_ = (obj, path) => {
  return path.split(".").reduce((prev, curr) => prev && prev[curr], obj);
};

// Função de busca paginada na Scryfall
const scryfallSearch_ = (query, num_results = MAX_RESULTS_, order = "name", dir = "auto", unique = "cards") => {
  const query_string = `q=${encodeURIComponent(query)}&order=${order}&dir=${dir}&unique=${unique}`;
  const scryfall_url = `https://api.scryfall.com/cards/search?${query_string}`;

  let data = [];
  let page = 1;
  let response;

  // tenta obter os resultados da Scryfall
  try {
    while (true) {
      response = JSON.parse(UrlFetchApp.fetch(`${scryfall_url}&page=${page}`).getContentText());

      if (!response.data) {
        throw new Error("Nenhum resultado da Scryfall");
      }

      data.push(...response.data);

      if (!response.has_more || data.length > num_results) {
        break;
      }

      page++;
    }
  } catch (error) {
    throw new Error(`Não foi possível recuperar resultados da Scryfall: ${error}`);
  }

  return data;
};
