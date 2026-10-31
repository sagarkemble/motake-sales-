# Cities are a table of their own; customers.city_id is nullable

Admin asked for every Customer to carry a City picked from a list. Admin keeps that list in Settings, and each City belongs to an Indian state. A missing City can be added from the Customer form, by Admin or a salesman.

Migration `0008_cities` adds three things:

- **`cities`:** `id`, `name` varchar(120), `state` varchar(120), `created_by` → profiles, and timestamps.
  - `state` holds the full name from the Indian states list, like `routes.delivery_state`.
  - A unique index on `(state, lower(name))` refuses the same name twice in one state, in any letter case, even under a race. The service checks first, so the screen can say `city_name_taken`.
  - Cities are never edited or deleted, so there is no `deleted_at`.
  - Each add gets an audit row, with the new `audit_entity_type` value `city`.
- **`customers.city_id`:** a FK to `cities` with `onDelete restrict`, plus an index.
- **Nullability:** `city_id` is nullable because existing Customers have no City and there is no data to fill it from. The Admin and salesman add forms and the API's create input require it. Admin edit requires it too, so an old Customer gets one at its next edit. The API never clears it.

The Customer reads (`getById`, the list) left-join the City and return `cityName` and `cityState`. The City is not stamped on Bills or Notes, and no Document prints it.

**Considered:**

- A free-text city column. Spellings would drift, and the user wanted a managed list.
- A fixed list in code, like the states. Admin must be able to add towns.
- Making `city_id` NOT NULL with a placeholder City for old rows. That invents data, and the edit form already asks for a City.
