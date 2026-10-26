"""Syntax this engine will interpret. Anything else stays uninterpreted."""

CHROMOSOME = r"(?:[1-9]|1[0-9]|2[0-2]|X|Y)"
BAND = r"[pq]\d+(?:\.\d+)?"

# A construct is interpreted only when every required piece is present.
SUPPORTED = {
    "count": "A leading chromosome count.",
    "sex": "A sex-chromosome complement such as XX, XY, X, or XXY.",
    "numerical": "A plus or minus before one chromosome name, such as +21.",
    "deletion": "del(chromosome)(band) or del(chromosome)(startBand endBand).",
    "duplication": "dup(chromosome)(band) or dup(chromosome)(startBand endBand).",
    "inversion": "inv(chromosome) with two breakpoints on that chromosome.",
    "translocation": "t(chromosome;chromosome)(band;band), two chromosomes and two breakpoints.",
    "derivative": "der(chromosome) followed by a supported t() with two breakpoints.",
    "isochromosome": "i(chromosome)(p10) or i(chromosome)(q10).",
    "robertsonian": "rob(acrocentric;acrocentric)(q10;q10) for chromosomes 13, 14, 15, 21, or 22.",
    "ring": "r(chromosome)(band band) with two breakpoints.",
    "mosaic": "A slash between cell lines, optionally preceded by mos.",
    "clone": "A cell-line count in square brackets, such as [12].",
}

# Named, then left uninterpreted. No structure is inferred from these tokens.
RECOGNIZED_UNSUPPORTED = {
    "add": "add() names material of unknown origin. No segment is drawn.",
    "mar": "mar names a marker of unknown origin. No segment is drawn.",
    "idic": "idic() is recognized and not interpreted.",
    "dic": "dic() is recognized and not interpreted.",
    "ins": "ins() is recognized and not interpreted.",
    "trp": "trp() is recognized and not interpreted.",
    "idem": "idem is recognized and not expanded into the abnormalities of another clone.",
    "chi": "chi is recognized. A chimeric relationship is not interpreted.",
}

ACROCENTRICS = {"13", "14", "15", "21", "22"}

LIMITATIONS = {
    "schematic": "The picture is a schematic built from cytogenetic bands. It is not a measurement of physical chromosome length.",
    "not_diagnosis": "A parsed formula is not a diagnosis. Disease names appear only when a stored record matches.",
    "no_invented_iscn": "A disease name is not turned into an ISCN string unless that string is already stored.",
    "fish": "A signal pattern belongs to one probe configuration. It is not inferred from a disease name or from a translocation alone.",
}
