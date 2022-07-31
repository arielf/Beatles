"use strict";
//
// vim: ts=4 sw=4 expandtab
//
//  Official docs:
//      https://github.com/d3/d3-force/tree/v3.0.0
//      https://d3-wiki.readthedocs.io/zh_CN/master/Force-Layout/
//      https://en.wikipedia.org/wiki/Verlet_integration
//
//  Force related default settings:
//      size 1×1
//      linkStrength 1
//      friction 0.9
//      distance 20
//      charge -30
//      gravity 0.1
//      theta 0.8
//
//  The default nodes and links are the empty array, and when the layout
//  is started, the internal alpha cooling parameter is set to 0.1
//
// A few of the parameters are explained here:
//   charge:
//      (Negative) charge determines repulsion
//      Effect is opposite of gravity (between two nodes)
//   linkStrength:
//      Pulls two negative charges closer together
//      A too high value (near 1.0) makes linked nodes overlap each
//      other and hard to tell-apart
//      A low value is great help to keep nodes apart.
//      0.1 seems near optimal.
//   friction:
//      Makes the graph movement stiffer & more resistant to change
//      when disturbed,
//   gravity:
//      Global gravity force: pulls everything towards the center
//      - If set to 1.0, everything becomes one big concentrated blob
//      - If set to 0.0, blobs of nodes remain detached / outside the canvas
//      Default is 0.1
//
var ERFILE = 'Beatles.json';
var LABELS = true;  // global toggle var for labels

function toggle_labels() {
    LABELS = ! LABELS
    let opa = LABELS ? 1 : 0;
    d3.selectAll('.labels').attr('opacity', opa)
}
function str(obj) { return JSON.stringify(obj) }
function istr(i) { return i.toString() }
function is_hub(d) { return ('_type' in d && d['_type'] == 'hub')}

function url_params() {
    var param_dict = {}
    let i, j, keyval;
    let query_parts = location.search.replace('?','').split('&');
    let qlen = query_parts.length
    for (i = 0; i < qlen; i++) {
        keyval = query_parts[i].split('=');
        let datafile = '';
        for (j = 0; j <= 1; j++) {
            // alert(`keyval=${keyval}  j:${j}  keyval[j]:${keyval[j]}`);
            if (keyval[j] && keyval[j].match(/\.json$/)) {
                datafile = keyval[j];
                if (datafile && ERFILE != datafile) {
                    ERFILE = datafile;
                    // should we force a reload here?
                }
            }
        }
        param_dict[keyval[0]] = keyval[1];
    }
    return param_dict;
};

// Update ERFILE iff ?<neworg>.json was passed via query-string
url_params();

// define the div for tooltips
var div = d3.select('body').append('div')
    .attr('class', 'tooltip')
    .style('opacity', 0);

function trim_long_str(str, maxlen) {
    // If input str length is too long, trim middle of string
    // and replace it with '...'
    let len = str.length;
    if (len > maxlen) {
        let glue = ' ... ';
        let sublen = ~~((maxlen / 2) - glue.length);
        if (sublen < 1) sublen = 1;
        return str.substr(0, sublen) + ' ... ' + str.substr(len-sublen);
    }
    return str;
}

//
// Shared global from the config:
// styles are used both in the main() callback and
// in 'node_tooltip_text()' so made this global
//
var STYLES = {};

function node_tooltip_text(d) {
    let blacklist = STYLES.tooltip.blacklist.keys;
    let hidenulls = STYLES.tooltip.blacklist.hidenulls || true;
    let namecolor = STYLES.tooltip.namecolor || '#ffff00';
    let output = '';
    if (is_hub(d)) {
        // Special case hubs
        let label = 'songs'
        let ppname = d.name.replace(/:/, ': ');
        if (d.weight == 1) label = 'song';
        return `<b>${ppname}</b><br/>(${d.weight} ${label})`;
    }
    // Other, regular nodes
    for (var prop in d) {
        if (blacklist.includes(prop)) {
            continue;
        }
        if (hidenulls & ! d[prop]) {
            continue;
        }
        var prop_line;
        if (prop == 'name') {
            prop_line = `<div style="color:${namecolor}"><b>${d[prop]}</b></div>`;
        } else if (prop == 'weight') {
            let val = d[prop];
            prop_line = `(${val} songs)<br/>`;
        } else {
            let val = trim_long_str(d[prop], 80);
            // Multi-word fields have dots instead of space in their names
            let clean_prop = prop.replaceAll('\.', ' ');
            prop_line = `<b>${clean_prop}:</b> ${val}<br/>`;
        }
        output += prop_line;
    }
    return output;
};

function add_text_at(parent, x, y, the_text, cls) {
    cls ||= 'ds';
    // NOTE: attempt to style text in SVG makes the text disappear!
    // let styled_txt = `<span class="ds">${the_text}</span>`;
    let the_link = `<a href="${the_text}">${the_text}</a>`;
    return d3.select(parent)
        .append('text').html(the_link)
            .attr('class', cls)
            .attr('x', x)
            .attr('y', y)
            .attr('opacity', 1.0)
    ;
}
//
// event-handlers for mouseover, mouseout => display tooltip
//
function mouseover_tooltip(d) {
    div.transition()
        .delay(0)
        .duration(0)
        .style('opacity', 1.0)
    div.html(node_tooltip_text(d))
            .style('left', (d3.event.pageX + 14) + 'px')
            .style('top', (d3.event.pageY - 30) + 'px')
    ;
}
function mouseout_tooltip(d) {
    div.transition()
        .delay(0)
        .duration(0)
        .style('opacity', 0.0)
    ;
}

//
// Make clicking the help div toggle the hub labels
//
document.getElementById('help').onclick = toggle_labels;

function main() {

    var callback = function(error, ercfg) {
        if (error) {
            alert(error);
            throw error;
        }
        STYLES = ercfg.styles;
        var nodestyle = STYLES.node.group;
        var linkstyle = STYLES.link.group;

        var fdg = ercfg.fdg;

        var thenodes = ercfg.nodes;
        var thelinks = ercfg.links;

        //
        // Add SVG element to canvas div
        //
        var canvasDiv = document.getElementById('canvas');
        var margin = {top: 0, right: 0, bottom: 0, left: 0};

        //
        // extra_XY to account for side-margins + top div's -> avoid scrollbars
        //
        const extra_height = 166;
        const extra_width = 20;
        var width = globalThis.innerWidth - extra_width;
        var height = globalThis.innerHeight - extra_height;

        var svg = d3.select(canvasDiv)
            .append('svg')
                .attr('width', width + margin.left + margin.right)
                .attr('height', height + margin.top + margin.bottom)
                .attr('id', 'canvas')
            .append('g')
                .attr('transform', function(d) {
                    return `translate(${margin.left}, ${margin.top})`
                })
        ;

        var force = d3.layout.force()
            .size([width, height])
            .gravity(fdg.gravity)
            .charge(fdg.charge)
            .chargeDistance(fdg.chargeDistance)
            .linkDistance(fdg.linkDistance)
            .linkStrength(fdg.linkStrength)
            .friction(fdg.friction)
            .theta(fdg.theta)
        ;

        force
            .nodes(thenodes)
            .links(thelinks)
            .start();

        var link = svg.selectAll('.link')
            .data(thelinks)
            .enter().append('line')
            .attr('class', 'link')
            .style('stroke', function(d) {
                if ('group' in d) {
                    let grp = d.group.toString();
                    return linkstyle[grp]['stroke'];
                }
                return 'black';
            })
            .style('stroke-width', function(d) {
                if ('group' in d) {
                    let grp = d.group.toString();
                    return linkstyle[grp]['stroke-width'];
                }
                return 1;
            })
            .style('stroke-opacity', function(d) {
                if ('group' in d) {
                    let grp = d.group.toString();
                    return linkstyle[grp]['stroke-opacity'];
                }
                return 1;
            })
            .style('fill', function(d) {
                if ('group' in d) {
                    let grp = d.group.toString();
                    return linkstyle[grp]['fill'];
                }
                return 'black';
            })
            ;

        var node = svg.selectAll('circle')
            .attr('class', 'node')
            .data(thenodes)
            .enter().append('circle')
                .attr('r', function(d) {
                    let grp = d.group.toString();
                    return nodestyle[grp].r;
                })
                .style('fill', function(d) {
                    let grp = d.group.toString();
                    return nodestyle[grp].fill;
                })
                .style('stroke', function(d) {
                    let grp = d.group.toString();
                    return nodestyle[grp].stroke;
                })
                .style('stroke-width', function(d) {
                    let grp = d.group.toString();
                    return nodestyle[grp]['stroke-width'];
                })
                .on('mouseover', mouseover_tooltip)
                .on('mouseout', mouseout_tooltip)
                .call(force.drag)
            ;

        var label;
        var thehubs = ercfg.nodes.filter(n => n._type == 'hub');
        var thelabels = thehubs.map(n => n.Year);

        label = svg.selectAll('text')
            .data(thehubs)
            .enter().append('text')
                .attr('class', 'labels')
                // dx should be derived from font & bubble size
                .attr('dx', -16)        // label (leftward) horiz offset
                .attr('dy', '.34em')    // label (downward) vert adjustment
                .attr('cx', function(d) { return d.cx })
                .attr('cy', function(d) { return d.cy })
                .style('fill', 'white')
                .text(function(d) { return d.name.replace(/[^:]*:/, '') })
                .on('mouseover', mouseover_tooltip)
            .on('mouseout', mouseout_tooltip)
            .call(force.drag)
            ;

        force.on('tick', function() {
            link
                .attr('x1', function(d) { return d.source.x; })
                .attr('y1', function(d) { return d.source.y; })
                .attr('x2', function(d) { return d.target.x; })
                .attr('y2', function(d) { return d.target.y; })
                ;

            node
                .attr('cx', function(d) { return d.x; })
                .attr('cy', function(d) { return d.y; })
                ;

            label
                .attr('x', function(d) { return d.x; })
                .attr('y', function(d) { return d.y; })
            ;
        });

        // add the dataset name
        /* add_text_at('svg', 770, 140, ERFILE); */
        add_text_at('svg', 4, 20, ERFILE);
    }

    d3.json(ERFILE, callback);
}

main();
