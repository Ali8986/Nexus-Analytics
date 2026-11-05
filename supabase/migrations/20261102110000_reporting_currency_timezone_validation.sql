CREATE TABLE private.iso_4217_currency_codes (
  code text PRIMARY KEY,
  numeric_code text NOT NULL,
  minor_units smallint,
  is_current boolean NOT NULL,
  reporting_allowed boolean NOT NULL,
  source_published_on date NOT NULL,
  withdrawn_on date,
  CONSTRAINT iso_4217_currency_code_format CHECK (code ~ '^[A-Z]{3}$'),
  CONSTRAINT iso_4217_numeric_code_format CHECK (numeric_code ~ '^[0-9]{3}$'),
  CONSTRAINT iso_4217_minor_units_range CHECK (
    minor_units IS NULL OR minor_units BETWEEN 0 AND 4
  ),
  CONSTRAINT iso_4217_reporting_requires_minor_units CHECK (
    NOT reporting_allowed OR minor_units IS NOT NULL
  ),
  CONSTRAINT iso_4217_withdrawal_state CHECK (
    (is_current AND withdrawn_on IS NULL)
    OR (NOT is_current AND withdrawn_on IS NOT NULL)
  )
);

CREATE UNIQUE INDEX iso_4217_current_numeric_code_idx
  ON private.iso_4217_currency_codes (numeric_code)
  WHERE is_current;

COMMENT ON TABLE private.iso_4217_currency_codes IS
  'ISO 4217 List One reference snapshot from SIX (https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml), retrieved 2026-11-02; source publication 2026-09-17. Withdrawn codes must be retained and marked non-current, never deleted.';

COMMENT ON COLUMN private.iso_4217_currency_codes.reporting_allowed IS
  'True for List One currency/fund entries with a numeric minor-unit value. N.A. special-purpose codes (including precious metals, bond/account units, test codes, and no-currency code XXX) are not valid workspace reporting currencies. New assignments also require is_current.';

COMMENT ON COLUMN private.iso_4217_currency_codes.is_current IS
  'When a code is withdrawn, mark it false and set withdrawn_on; do not delete the reference row, because existing workspace values may retain it historically.';

COMMENT ON COLUMN private.iso_4217_currency_codes.withdrawn_on IS
  'Date the source first reports the code as withdrawn; NULL while the code remains current.';

INSERT INTO private.iso_4217_currency_codes (
  code,
  numeric_code,
  minor_units,
  is_current,
  reporting_allowed,
  source_published_on
)
VALUES
  ('AED', '784', 2, true, true, DATE '2026-09-17'),
  ('AFN', '971', 2, true, true, DATE '2026-09-17'),
  ('ALL', '008', 2, true, true, DATE '2026-09-17'),
  ('AMD', '051', 2, true, true, DATE '2026-09-17'),
  ('AOA', '973', 2, true, true, DATE '2026-09-17'),
  ('ARS', '032', 2, true, true, DATE '2026-09-17'),
  ('AUD', '036', 2, true, true, DATE '2026-09-17'),
  ('AWG', '533', 2, true, true, DATE '2026-09-17'),
  ('AZN', '944', 2, true, true, DATE '2026-09-17'),
  ('BAM', '977', 2, true, true, DATE '2026-09-17'),
  ('BBD', '052', 2, true, true, DATE '2026-09-17'),
  ('BDT', '050', 2, true, true, DATE '2026-09-17'),
  ('BHD', '048', 3, true, true, DATE '2026-09-17'),
  ('BIF', '108', 0, true, true, DATE '2026-09-17'),
  ('BMD', '060', 2, true, true, DATE '2026-09-17'),
  ('BND', '096', 2, true, true, DATE '2026-09-17'),
  ('BOB', '068', 2, true, true, DATE '2026-09-17'),
  ('BOV', '984', 2, true, true, DATE '2026-09-17'),
  ('BRL', '986', 2, true, true, DATE '2026-09-17'),
  ('BSD', '044', 2, true, true, DATE '2026-09-17'),
  ('BTN', '064', 2, true, true, DATE '2026-09-17'),
  ('BWP', '072', 2, true, true, DATE '2026-09-17'),
  ('BYN', '933', 2, true, true, DATE '2026-09-17'),
  ('BZD', '084', 2, true, true, DATE '2026-09-17'),
  ('CAD', '124', 2, true, true, DATE '2026-09-17'),
  ('CDF', '976', 2, true, true, DATE '2026-09-17'),
  ('CHE', '947', 2, true, true, DATE '2026-09-17'),
  ('CHF', '756', 2, true, true, DATE '2026-09-17'),
  ('CHW', '948', 2, true, true, DATE '2026-09-17'),
  ('CLF', '990', 4, true, true, DATE '2026-09-17'),
  ('CLP', '152', 0, true, true, DATE '2026-09-17'),
  ('CNY', '156', 2, true, true, DATE '2026-09-17'),
  ('COP', '170', 2, true, true, DATE '2026-09-17'),
  ('COU', '970', 2, true, true, DATE '2026-09-17'),
  ('CRC', '188', 2, true, true, DATE '2026-09-17'),
  ('CUP', '192', 2, true, true, DATE '2026-09-17'),
  ('CVE', '132', 2, true, true, DATE '2026-09-17'),
  ('CZK', '203', 2, true, true, DATE '2026-09-17'),
  ('DJF', '262', 0, true, true, DATE '2026-09-17'),
  ('DKK', '208', 2, true, true, DATE '2026-09-17'),
  ('DOP', '214', 2, true, true, DATE '2026-09-17'),
  ('DZD', '012', 2, true, true, DATE '2026-09-17'),
  ('EGP', '818', 2, true, true, DATE '2026-09-17'),
  ('ERN', '232', 2, true, true, DATE '2026-09-17'),
  ('ETB', '230', 2, true, true, DATE '2026-09-17'),
  ('EUR', '978', 2, true, true, DATE '2026-09-17'),
  ('FJD', '242', 2, true, true, DATE '2026-09-17'),
  ('FKP', '238', 2, true, true, DATE '2026-09-17'),
  ('GBP', '826', 2, true, true, DATE '2026-09-17'),
  ('GEL', '981', 2, true, true, DATE '2026-09-17'),
  ('GHS', '936', 2, true, true, DATE '2026-09-17'),
  ('GIP', '292', 2, true, true, DATE '2026-09-17'),
  ('GMD', '270', 2, true, true, DATE '2026-09-17'),
  ('GNF', '324', 0, true, true, DATE '2026-09-17'),
  ('GTQ', '320', 2, true, true, DATE '2026-09-17'),
  ('GYD', '328', 2, true, true, DATE '2026-09-17'),
  ('HKD', '344', 2, true, true, DATE '2026-09-17'),
  ('HNL', '340', 2, true, true, DATE '2026-09-17'),
  ('HTG', '332', 2, true, true, DATE '2026-09-17'),
  ('HUF', '348', 2, true, true, DATE '2026-09-17'),
  ('IDR', '360', 2, true, true, DATE '2026-09-17'),
  ('ILS', '376', 2, true, true, DATE '2026-09-17'),
  ('INR', '356', 2, true, true, DATE '2026-09-17'),
  ('IQD', '368', 3, true, true, DATE '2026-09-17'),
  ('IRR', '364', 2, true, true, DATE '2026-09-17'),
  ('ISK', '352', 0, true, true, DATE '2026-09-17'),
  ('JMD', '388', 2, true, true, DATE '2026-09-17'),
  ('JOD', '400', 3, true, true, DATE '2026-09-17'),
  ('JPY', '392', 0, true, true, DATE '2026-09-17'),
  ('KES', '404', 2, true, true, DATE '2026-09-17'),
  ('KGS', '417', 2, true, true, DATE '2026-09-17'),
  ('KHR', '116', 2, true, true, DATE '2026-09-17'),
  ('KMF', '174', 0, true, true, DATE '2026-09-17'),
  ('KPW', '408', 2, true, true, DATE '2026-09-17'),
  ('KRW', '410', 0, true, true, DATE '2026-09-17'),
  ('KWD', '414', 3, true, true, DATE '2026-09-17'),
  ('KYD', '136', 2, true, true, DATE '2026-09-17'),
  ('KZT', '398', 2, true, true, DATE '2026-09-17'),
  ('LAK', '418', 2, true, true, DATE '2026-09-17'),
  ('LBP', '422', 2, true, true, DATE '2026-09-17'),
  ('LKR', '144', 2, true, true, DATE '2026-09-17'),
  ('LRD', '430', 2, true, true, DATE '2026-09-17'),
  ('LSL', '426', 2, true, true, DATE '2026-09-17'),
  ('LYD', '434', 3, true, true, DATE '2026-09-17'),
  ('MAD', '504', 2, true, true, DATE '2026-09-17'),
  ('MDL', '498', 2, true, true, DATE '2026-09-17'),
  ('MGA', '969', 2, true, true, DATE '2026-09-17'),
  ('MKD', '807', 2, true, true, DATE '2026-09-17'),
  ('MMK', '104', 2, true, true, DATE '2026-09-17'),
  ('MNT', '496', 2, true, true, DATE '2026-09-17'),
  ('MOP', '446', 2, true, true, DATE '2026-09-17'),
  ('MRU', '929', 2, true, true, DATE '2026-09-17'),
  ('MUR', '480', 2, true, true, DATE '2026-09-17'),
  ('MVR', '462', 2, true, true, DATE '2026-09-17'),
  ('MWK', '454', 2, true, true, DATE '2026-09-17'),
  ('MXN', '484', 2, true, true, DATE '2026-09-17'),
  ('MXV', '979', 2, true, true, DATE '2026-09-17'),
  ('MYR', '458', 2, true, true, DATE '2026-09-17'),
  ('MZN', '943', 2, true, true, DATE '2026-09-17'),
  ('NAD', '516', 2, true, true, DATE '2026-09-17'),
  ('NGN', '566', 2, true, true, DATE '2026-09-17'),
  ('NIO', '558', 2, true, true, DATE '2026-09-17'),
  ('NOK', '578', 2, true, true, DATE '2026-09-17'),
  ('NPR', '524', 2, true, true, DATE '2026-09-17'),
  ('NZD', '554', 2, true, true, DATE '2026-09-17'),
  ('OMR', '512', 3, true, true, DATE '2026-09-17'),
  ('PAB', '590', 2, true, true, DATE '2026-09-17'),
  ('PEN', '604', 2, true, true, DATE '2026-09-17'),
  ('PGK', '598', 2, true, true, DATE '2026-09-17'),
  ('PHP', '608', 2, true, true, DATE '2026-09-17'),
  ('PKR', '586', 2, true, true, DATE '2026-09-17'),
  ('PLN', '985', 2, true, true, DATE '2026-09-17'),
  ('PYG', '600', 0, true, true, DATE '2026-09-17'),
  ('QAR', '634', 2, true, true, DATE '2026-09-17'),
  ('RON', '946', 2, true, true, DATE '2026-09-17'),
  ('RSD', '941', 2, true, true, DATE '2026-09-17'),
  ('RUB', '643', 2, true, true, DATE '2026-09-17'),
  ('RWF', '646', 0, true, true, DATE '2026-09-17'),
  ('SAR', '682', 2, true, true, DATE '2026-09-17'),
  ('SBD', '090', 2, true, true, DATE '2026-09-17'),
  ('SCR', '690', 2, true, true, DATE '2026-09-17'),
  ('SDG', '938', 2, true, true, DATE '2026-09-17'),
  ('SEK', '752', 2, true, true, DATE '2026-09-17'),
  ('SGD', '702', 2, true, true, DATE '2026-09-17'),
  ('SHP', '654', 2, true, true, DATE '2026-09-17'),
  ('SLE', '925', 2, true, true, DATE '2026-09-17'),
  ('SOS', '706', 2, true, true, DATE '2026-09-17'),
  ('SRD', '968', 2, true, true, DATE '2026-09-17'),
  ('SSP', '728', 2, true, true, DATE '2026-09-17'),
  ('STN', '930', 2, true, true, DATE '2026-09-17'),
  ('SVC', '222', 2, true, true, DATE '2026-09-17'),
  ('SYP', '760', 2, true, true, DATE '2026-09-17'),
  ('SZL', '748', 2, true, true, DATE '2026-09-17'),
  ('THB', '764', 2, true, true, DATE '2026-09-17'),
  ('TJS', '972', 2, true, true, DATE '2026-09-17'),
  ('TMT', '934', 2, true, true, DATE '2026-09-17'),
  ('TND', '788', 3, true, true, DATE '2026-09-17'),
  ('TOP', '776', 2, true, true, DATE '2026-09-17'),
  ('TRY', '949', 2, true, true, DATE '2026-09-17'),
  ('TTD', '780', 2, true, true, DATE '2026-09-17'),
  ('TWD', '901', 2, true, true, DATE '2026-09-17'),
  ('TZS', '834', 2, true, true, DATE '2026-09-17'),
  ('UAH', '980', 2, true, true, DATE '2026-09-17'),
  ('UGX', '800', 0, true, true, DATE '2026-09-17'),
  ('USD', '840', 2, true, true, DATE '2026-09-17'),
  ('USN', '997', 2, true, true, DATE '2026-09-17'),
  ('UYI', '940', 0, true, true, DATE '2026-09-17'),
  ('UYU', '858', 2, true, true, DATE '2026-09-17'),
  ('UYW', '927', 4, true, true, DATE '2026-09-17'),
  ('UZS', '860', 2, true, true, DATE '2026-09-17'),
  ('VED', '926', 2, true, true, DATE '2026-09-17'),
  ('VES', '928', 2, true, true, DATE '2026-09-17'),
  ('VND', '704', 0, true, true, DATE '2026-09-17'),
  ('VUV', '548', 0, true, true, DATE '2026-09-17'),
  ('WST', '882', 2, true, true, DATE '2026-09-17'),
  ('XAD', '396', 2, true, true, DATE '2026-09-17'),
  ('XAF', '950', 0, true, true, DATE '2026-09-17'),
  ('XAG', '961', NULL, true, false, DATE '2026-09-17'),
  ('XAU', '959', NULL, true, false, DATE '2026-09-17'),
  ('XBA', '955', NULL, true, false, DATE '2026-09-17'),
  ('XBB', '956', NULL, true, false, DATE '2026-09-17'),
  ('XBC', '957', NULL, true, false, DATE '2026-09-17'),
  ('XBD', '958', NULL, true, false, DATE '2026-09-17'),
  ('XCD', '951', 2, true, true, DATE '2026-09-17'),
  ('XCG', '532', 2, true, true, DATE '2026-09-17'),
  ('XDR', '960', NULL, true, false, DATE '2026-09-17'),
  ('XOF', '952', 0, true, true, DATE '2026-09-17'),
  ('XPD', '964', NULL, true, false, DATE '2026-09-17'),
  ('XPF', '953', 0, true, true, DATE '2026-09-17'),
  ('XPT', '962', NULL, true, false, DATE '2026-09-17'),
  ('XSU', '994', NULL, true, false, DATE '2026-09-17'),
  ('XTS', '963', NULL, true, false, DATE '2026-09-17'),
  ('XUA', '965', NULL, true, false, DATE '2026-09-17'),
  ('XXX', '999', NULL, true, false, DATE '2026-09-17'),
  ('YER', '886', 2, true, true, DATE '2026-09-17'),
  ('ZAR', '710', 2, true, true, DATE '2026-09-17'),
  ('ZMW', '967', 2, true, true, DATE '2026-09-17'),
  ('ZWG', '924', 2, true, true, DATE '2026-09-17');

DO $migration$
DECLARE
  v_invalid_workspace_ids text;
BEGIN
  SELECT pg_catalog.string_agg(workspace.id::text, ', ' ORDER BY workspace.id)
  INTO v_invalid_workspace_ids
  FROM public.workspaces AS workspace
  LEFT JOIN private.iso_4217_currency_codes AS currency
    ON currency.code = workspace.reporting_currency
  WHERE currency.code IS NULL
     OR NOT currency.is_current
     OR NOT currency.reporting_allowed
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_timezone_names AS timezone
       WHERE timezone.name = workspace.reporting_timezone
     );

  IF v_invalid_workspace_ids IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Reporting validation migration found workspaces with unsupported currency or timezone',
      DETAIL = v_invalid_workspace_ids;
  END IF;
END;
$migration$;

ALTER TABLE public.workspaces
  DROP CONSTRAINT workspaces_currency_format;

ALTER TABLE public.workspaces
  ADD CONSTRAINT workspaces_reporting_currency_fkey
  FOREIGN KEY (reporting_currency)
  REFERENCES private.iso_4217_currency_codes (code)
  ON UPDATE RESTRICT
  ON DELETE RESTRICT
  NOT VALID;

ALTER TABLE public.workspaces
  VALIDATE CONSTRAINT workspaces_reporting_currency_fkey;

CREATE FUNCTION private.validate_workspace_reporting_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_reporting_allowed boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT currency.is_current AND currency.reporting_allowed
    INTO v_reporting_allowed
    FROM private.iso_4217_currency_codes AS currency
    WHERE currency.code = NEW.reporting_currency;

    IF v_reporting_allowed IS DISTINCT FROM true THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'Unsupported reporting currency';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_timezone_names AS timezone
      WHERE timezone.name = NEW.reporting_timezone
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'Unsupported reporting timezone';
    END IF;
  ELSE
    IF NEW.reporting_currency IS DISTINCT FROM OLD.reporting_currency THEN
      SELECT currency.is_current AND currency.reporting_allowed
      INTO v_reporting_allowed
      FROM private.iso_4217_currency_codes AS currency
      WHERE currency.code = NEW.reporting_currency;

      IF v_reporting_allowed IS DISTINCT FROM true THEN
        RAISE EXCEPTION USING
          ERRCODE = '22023',
          MESSAGE = 'Unsupported reporting currency';
      END IF;
    END IF;

    IF NEW.reporting_timezone IS DISTINCT FROM OLD.reporting_timezone
       AND NOT EXISTS (
         SELECT 1
         FROM pg_catalog.pg_timezone_names AS timezone
         WHERE timezone.name = NEW.reporting_timezone
       ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'Unsupported reporting timezone';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER workspaces_validate_reporting_settings
BEFORE INSERT OR UPDATE OF reporting_currency, reporting_timezone
ON public.workspaces
FOR EACH ROW
EXECUTE FUNCTION private.validate_workspace_reporting_settings();

REVOKE ALL ON TABLE private.iso_4217_currency_codes
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION private.validate_workspace_reporting_settings()
  FROM PUBLIC, anon, authenticated, service_role;
