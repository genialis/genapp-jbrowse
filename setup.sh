#!/bin/bash
ssh -p 10222 root@gendev.lan -t 'apt-get install libdatetime-perl curl liblocal-lib-perl && \
    cd /srv/gendev_slugs/jbrowse-1.11.3/ && ./setup.sh'