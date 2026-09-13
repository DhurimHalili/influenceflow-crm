-- Brands get a free-form type/category (PC Hardware, Peripherals, Gaming Gear,
-- Software, …) so agencies can group and filter brands by what they sell.
alter table public.brands
  add column if not exists brand_type text;
