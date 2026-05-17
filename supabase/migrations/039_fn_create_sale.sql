-- 039 · fn_create_sale: venta POS atómica.
--
-- Reemplaza la secuencia client-side de 5 writes (transaction → sale → sale_items → N×update products → N×inventory_movements)
-- que tenía 2 problemas:
--   1) Race condition: dos ventas concurrentes leen `stock=5`, ambas calculan `5-qty` desde memoria, y queda
--      stock incorrecto (la última escribe pisa a la primera).
--   2) No-atomicidad: si falla cualquiera de los inserts/updates posteriores, queda estado inconsistente
--      (stock decrementado sin sale_items, o sale_items sin inventory_movements, etc.).
--
-- Esta function corre todo dentro de la misma transacción Postgres, con `select ... for update` sobre cada
-- `products` para serializar concurrentes y `update products set stock = stock - qty` para no leer stale.
--
-- p_items: jsonb array `[{ "product_id": "uuid", "qty": int }, ...]`.
-- Retorna el sale_id (uuid). El caller hace SELECT a `sales` para hidratar el objeto.

create or replace function fn_create_sale(
  p_club_id uuid,
  p_user_id uuid,
  p_customer_user_id uuid,
  p_customer_name text,
  p_method mp_payment_method,
  p_items jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_id uuid;
  v_tx_id uuid;
  v_session_id uuid;
  v_total_cents int := 0;
  v_currency mp_currency;
  v_item jsonb;
  v_product_id uuid;
  v_qty int;
  v_price_cents int;
  v_stock int;
  v_active boolean;
  v_p_club_id uuid;
  v_p_currency mp_currency;
begin
  -- Validate caller is staff/employee del club.
  if not (mp_club_staff(p_club_id) or mp_is_employee_of(p_club_id)) then
    raise exception 'AUTH.ROLE_REQUIRED' using errcode = '42501';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'PROSHOP.EMPTY' using errcode = '22023';
  end if;

  -- Cash session: para cash es obligatoria; para otros métodos opcional (linkea si está abierta).
  select id into v_session_id from cash_sessions
    where club_id = p_club_id and status = 'open' limit 1;
  if p_method = 'cash' and v_session_id is null then
    raise exception 'CASH.SESSION_CLOSED' using errcode = '22023';
  end if;

  -- Pass 1: lock + validar + calcular total. `for update` previene race con otra venta concurrente.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'qty')::int;
    if v_qty <= 0 then
      raise exception 'PROSHOP.INVALID_QTY' using errcode = '22023';
    end if;

    select club_id, price_cents, currency, stock, active
      into v_p_club_id, v_price_cents, v_p_currency, v_stock, v_active
      from products where id = v_product_id
      for update;
    if not found then
      raise exception 'PROSHOP.NOT_FOUND' using errcode = 'P0002', detail = v_product_id::text;
    end if;
    if not v_active then
      raise exception 'PROSHOP.INACTIVE' using errcode = '22023', detail = v_product_id::text;
    end if;
    if v_p_club_id is not null and v_p_club_id <> p_club_id then
      raise exception 'PROSHOP.CLUB_MISMATCH' using errcode = '22023', detail = v_product_id::text;
    end if;
    if v_stock < v_qty then
      raise exception 'PROSHOP.OUT_OF_STOCK'
        using errcode = '22023',
              detail = format('product %s stock %s need %s', v_product_id, v_stock, v_qty);
    end if;
    if v_currency is null then
      v_currency := v_p_currency;
    elsif v_currency <> v_p_currency then
      raise exception 'PROSHOP.CURRENCY_MIXED' using errcode = '22023';
    end if;
    v_total_cents := v_total_cents + v_price_cents * v_qty;
  end loop;

  -- 1. Transaction (money).
  insert into transactions (
    club_id, cash_session_id, kind, customer_user_id, customer_name,
    amount_cents, currency, method, status, created_by
  ) values (
    p_club_id, v_session_id, 'proshop_sale', p_customer_user_id, p_customer_name,
    v_total_cents, v_currency, p_method, 'captured', p_user_id
  ) returning id into v_tx_id;

  -- 2. Sale header.
  insert into sales (
    club_id, customer_user_id, transaction_id, total_cents, currency, sold_by
  ) values (
    p_club_id, p_customer_user_id, v_tx_id, v_total_cents, v_currency, p_user_id
  ) returning id into v_sale_id;

  -- 3. Pass 2: por cada item, insertar line, decrementar stock atómicamente y registrar movimiento.
  --    El `stock = stock - qty` evita re-leer un valor stale; el lock de la pass 1 garantiza que
  --    ningún otro proceso movió el stock entre pass 1 y aquí.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'qty')::int;

    select price_cents into v_price_cents from products where id = v_product_id;

    insert into sale_items (sale_id, product_id, qty, unit_price_cents)
    values (v_sale_id, v_product_id, v_qty, v_price_cents);

    update products set stock = stock - v_qty where id = v_product_id;

    insert into inventory_movements (product_id, delta, reason, ref_id, created_by)
    values (v_product_id, -v_qty, 'sale', v_sale_id, p_user_id);
  end loop;

  return v_sale_id;
end;
$$;

revoke all on function fn_create_sale(uuid, uuid, uuid, text, mp_payment_method, jsonb) from public;
grant execute on function fn_create_sale(uuid, uuid, uuid, text, mp_payment_method, jsonb) to authenticated;
