export default {
  async fetch(request, env) {

    const VQD_REGEX = new RegExp(/vqd='(\d+-\d+(?:-\d+)?)'/);
    const SEARCH_REGEX = new RegExp(/DDG\.pageLayout\.load\('d',(\[.+\])\);DDG\.duckbar\.load\('images'/);

    const init = {
      headers: {
        "content-type": "application/json;charset=UTF-8",
      },
    };

    async function gatherResponse(response) {
      const { headers } = response;
      const contentType = headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        return JSON.stringify(await response.json());
      }
      return response.text();
    }

    async function getVQD(query, ia = "web") {
      const url = `https://duckduckgo.com?q=${query}&ia=${ia}`;
      const response = await fetch(url, init);
      const results = await gatherResponse(response);
      let vqd = VQD_REGEX.exec(results)[1];
      return vqd;
    }

    async function getSearches(query, vqd) {
      const response = await fetch(
        `https://links.duckduckgo.com/d.js?q=${query}&kl=wt-wt&dl=en&ct=US&vqd=${vqd}&sp=1&bpa=1&biaexp=b&msvrtexp=b&nadse=b&eclsexp=b&tjsexp=b`, init
      );
      const results = await gatherResponse(response);

      if (results.includes("DDG.deep.is506"))
        throw new Error("A server error occurred!");

      const searchResults = JSON.parse(
        SEARCH_REGEX.exec(results)[1].replace(/\t/g, "    ")
      );

      // check for no results
      if (searchResults.length === 1 && !("n" in searchResults[0])) {
        const onlyResult = searchResults[0];
        if (
          (!onlyResult.da && onlyResult.t === "EOF") ||
          !onlyResult.a ||
          onlyResult.d === "google.com search"
        )
          return {
            noResults: true,
            vqd,
            results: [],
          };
      }

      let fResults = [];

      // Populate search results
      for (const search of searchResults) {
        if ("n" in search) continue;
        let bang;
        if (search.b) {
          const [prefix, title, domain] = search.b.split("\t");
          bang = { prefix, title, domain };
        }
        fResults.push({
          title: search.t,
          description: search.a,
          rawDescription: search.a,
          hostname: search.i,
          icon: `https://external-content.duckduckgo.com/ip3/${search.i}.ico`,
          url: search.u,
          bang,
        });
      }

      return fResults;
    }

    try {
      const url = new URL(request.url);

      const query = url.searchParams.get('query');
      const count = url.searchParams.get('count');

      if(!query) {
        return new Response(JSON.stringify({message: 'query not found'}), { status: 500 })
      }

      const vqd = await getVQD(query);
      const sr = await getSearches(query, vqd, count);

      return new Response(JSON.stringify(sr), init);

    } catch(e) {
      return new Response(err.stack, { status: 500 })
    }
  }
}
