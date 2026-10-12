-- Open Philanthropy rebranded to Coefficient Giving. Rename it in answers
-- already saved so existing profiles keep their box ticked and reports count
-- one funder, not two.
UPDATE "users" SET "funders" = array_replace("funders", 'Open Philanthropy', 'Coefficient Giving') WHERE 'Open Philanthropy' = ANY("funders");
