# Vehicle catalog

The shared catalog is used by Case model/variant options, Lead model options,
vehicle extraction and the customer-name exclusion list. Existing Case values
remain selectable even when absent from the current catalog.

Source: https://www.zigwheels.my/new-cars and each entry's `source` URL.
This is a market-directory snapshot, not a manufacturer-certified exhaustive
inventory. Listings without a published RM price, upcoming/discontinued cards,
and used-car cards are excluded. This intentionally excludes unverified
by-order listings; a listed price does not guarantee current dealer stock.
No prices or assumed paint colors are imported into customer forms.

To refresh in a development environment:

```sh
npm install --prefix /tmp/casepilot-catalog-tools linkedom
node scripts/import-vehicle-catalog.mjs
node scripts/test-lead-ingest.mjs
```

`DOM_PARSER_PATH` can point at another installation's `linkedom/esm/index.js`.
Review the generated report and source changes before releasing a refresh.
The importer is manual; it does not run on application startup or in production.
