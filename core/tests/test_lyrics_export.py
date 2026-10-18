from syncopate import export
from syncopate.align import _fill_unaligned
from syncopate.lyrics import normalize_word, parse_lyrics


def test_parse_skips_blanks_and_section_markers():
    lines = parse_lyrics("[Verse 1]\nHello there\n\n(Chorus)\nOh, oh-oh!\n")
    assert [line.text for line in lines] == ["Hello there", "Oh, oh-oh!"]
    assert [line.section for line in lines] == ["Verse 1", "Chorus"]


def test_normalize_strips_accents_and_punctuation():
    assert normalize_word("Café,") == "cafe"
    assert normalize_word("don't") == "don't"
    assert normalize_word("2024") == ""


def test_unalignable_words_fill_the_gap():
    (line,) = parse_lyrics("one 2 three")
    line.words[0].start, line.words[0].end = 1.0, 1.5
    line.words[2].start, line.words[2].end = 2.0, 2.5
    _fill_unaligned([line])
    assert (line.words[1].start, line.words[1].end) == (1.5, 2.0)


def test_lrc_and_srt_formats():
    (line,) = parse_lyrics("hello world")
    for w, (s, e) in zip(line.words, [(65.5, 66.0), (66.0, 67.25)]):
        w.start, w.end = s, e
    assert export.to_lrc([line]).strip() == "[01:05.50]hello world"
    assert "00:01:05,500 --> 00:01:07,250" in export.to_srt([line])
    assert export.to_csv([line]).splitlines()[1] == "1,65.500,67.250,,hello world"
