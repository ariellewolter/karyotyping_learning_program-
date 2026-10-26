-- Local cytogenetics reference database.
-- Read-only at query time. Import scripts rebuild these tables.

PRAGMA foreign_keys = ON;

CREATE TABLE diseases (
  disease_id TEXT PRIMARY KEY,
  preferred_name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  description TEXT,
  category TEXT,
  record_class TEXT NOT NULL,
  source TEXT NOT NULL,
  source_record TEXT,
  retrieved TEXT
);

CREATE TABLE disease_synonyms (
  disease_id TEXT NOT NULL,
  synonym TEXT NOT NULL,
  synonym_key TEXT NOT NULL,
  source TEXT,
  FOREIGN KEY (disease_id) REFERENCES diseases(disease_id)
);

CREATE TABLE disease_identifiers (
  disease_id TEXT NOT NULL,
  system TEXT NOT NULL,
  code TEXT NOT NULL,
  FOREIGN KEY (disease_id) REFERENCES diseases(disease_id)
);

CREATE TABLE abnormalities (
  abnormality_id TEXT PRIMARY KEY,
  abnormality_type TEXT,
  chromosomes TEXT,
  arms TEXT,
  bands TEXT,
  assembly TEXT,
  genomic_location TEXT,
  chrom TEXT,
  start_pos INTEGER,
  end_pos INTEGER,
  genes TEXT,
  iscn TEXT,
  record_class TEXT NOT NULL,
  source TEXT NOT NULL,
  source_record TEXT,
  evidence_label TEXT
);

CREATE TABLE associations (
  disease_id TEXT NOT NULL,
  abnormality_id TEXT NOT NULL,
  association_type TEXT,
  evidence_source TEXT,
  evidence_strength TEXT,
  match_class TEXT NOT NULL,
  PRIMARY KEY (disease_id, abnormality_id, association_type),
  FOREIGN KEY (disease_id) REFERENCES diseases(disease_id),
  FOREIGN KEY (abnormality_id) REFERENCES abnormalities(abnormality_id)
);

CREATE TABLE iscn_records (
  iscn_id INTEGER PRIMARY KEY,
  original TEXT NOT NULL,
  normalized TEXT NOT NULL,
  events_json TEXT,
  abnormality_id TEXT,
  disease_id TEXT,
  record_class TEXT NOT NULL,
  source TEXT NOT NULL,
  source_record TEXT
);

CREATE TABLE gene_fusions (
  fusion_id TEXT PRIMARY KEY,
  gene_a TEXT NOT NULL,
  gene_b TEXT NOT NULL,
  symbol TEXT NOT NULL,
  symbol_key TEXT NOT NULL,
  rearrangement TEXT,
  record_class TEXT NOT NULL,
  source TEXT NOT NULL
);

CREATE TABLE fusion_diseases (
  fusion_id TEXT NOT NULL,
  disease_id TEXT NOT NULL,
  match_class TEXT NOT NULL,
  PRIMARY KEY (fusion_id, disease_id),
  FOREIGN KEY (fusion_id) REFERENCES gene_fusions(fusion_id),
  FOREIGN KEY (disease_id) REFERENCES diseases(disease_id)
);

CREATE TABLE fish_probes (
  probe_id TEXT PRIMARY KEY,
  probe_name TEXT NOT NULL,
  strategy TEXT NOT NULL,
  reference_note TEXT,
  documentation TEXT,
  record_class TEXT NOT NULL,
  source TEXT NOT NULL
);

CREATE TABLE fish_targets (
  probe_id TEXT NOT NULL,
  locus TEXT,
  gene TEXT,
  fluorophore TEXT,
  sort_order INTEGER,
  FOREIGN KEY (probe_id) REFERENCES fish_probes(probe_id)
);

CREATE TABLE fish_patterns (
  probe_id TEXT NOT NULL,
  pattern_role TEXT NOT NULL,
  pattern TEXT NOT NULL,
  note TEXT,
  FOREIGN KEY (probe_id) REFERENCES fish_probes(probe_id)
);

CREATE TABLE fish_probe_diseases (
  probe_id TEXT NOT NULL,
  disease_id TEXT NOT NULL,
  PRIMARY KEY (probe_id, disease_id),
  FOREIGN KEY (probe_id) REFERENCES fish_probes(probe_id),
  FOREIGN KEY (disease_id) REFERENCES diseases(disease_id)
);

CREATE TABLE source_meta (
  source_id TEXT PRIMARY KEY,
  title TEXT,
  url TEXT,
  retrieved TEXT,
  file_date TEXT,
  license_note TEXT,
  record_count INTEGER
);

CREATE INDEX idx_diseases_name ON diseases(name_key);
CREATE INDEX idx_synonyms_key ON disease_synonyms(synonym_key);
CREATE INDEX idx_identifiers_code ON disease_identifiers(system, code);
CREATE INDEX idx_abnormality_type ON abnormalities(abnormality_type);
CREATE INDEX idx_iscn_normalized ON iscn_records(normalized);
CREATE INDEX idx_fusions_key ON gene_fusions(symbol_key);
CREATE INDEX idx_fusions_gene_a ON gene_fusions(gene_a);
CREATE INDEX idx_fusions_gene_b ON gene_fusions(gene_b);
CREATE INDEX idx_associations_disease ON associations(disease_id);
CREATE INDEX idx_associations_abnormality ON associations(abnormality_id);
