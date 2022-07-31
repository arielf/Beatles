all:
	# ./data2er Beatles-DB.csv | minify --type json > Beatles.json
	minify -v force-directed-graph.js > fdg.min.js
	chmod 644 index.html Beatles.json fdg.min.js

