Binary compatibility fixtures from the Apache POI project (Apache License 2.0).
Downloaded 2026-09-30 from https://github.com/apache/poi/tree/trunk/test-data/slideshow.
`basic.ppt` is the upstream `basic_test_ppt_file.ppt`; other filenames are unchanged.
The accompanying APACHE-LICENSE.txt applies to these fixtures.

The basic and textbox expectations also match POI's HSLF TestExtractor tests.
The slide-order fixture verifies presentation order rather than binary storage order.
Encrypted and malformed files are failure fixtures, never executed.
