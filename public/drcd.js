(function ($) {

    /*
    * drcd  1.0
    * Copyright (c) 2021 Connor DeVries
    * Date: 2021-01-12
    */

    /** The root class for the drcd
    @name drcd
    @class This is the root class for the DE jQuery UI framework
    */
    $.drcd = $.drcd || {};

    // Extend the deui class/namespace
    $.extend($.drcd, {

        commonData: {
            pages: {
                home: {templateFile:'home.htm', title:'Home'},
                whitelisting: {templateFile:'whitelisting.htm', title:'Whitelisting'},
                rules: {templateFile:'rules.htm', title:'Rules'},
                contact: {templateFile:'contact.htm', title:'Contact'},
                test: {templateFile:'test.htm', title:'Test'},
                coreprotect: {templateFile:'coreprotect.htm', title:'Core Protect'},
                ajax: {templateFile:'ajax.htm', title:'Ajax'}

            }
        },
    

        loadPage : function(pageIndex){

            let page = $.drcd.commonData.pages[pageIndex];

            $.get("/templates/" + page.templateFile).then(
                function(data){
                    $('.pageContent').empty().html(data);
                    window.history.pushState({"html":data,"pageTitle":page.title},"", page.templateFile);
                },
                function(error){
                    console.error(error);
                }
            )

        },

        menuItemClick: function(evt){
            $.drcd.loadPage($(evt.currentTarget).attr("data-pageName"));
        },

        menuItemsLoad: function(){
            //Run through the pages json and add MenuItems for Each of the Pages
           let $menuItemTemplate =  $(".templates").find(".menuItemTemplate").find(".nav-item");
           let $menuItemsContainer = $(".navbar").find(".navbar-nav");
           $menuItemsContainer.empty();
           $.each($.drcd.commonData.pages, function(index,item){
               let $menuItem = $menuItemTemplate.clone();
               $menuItem.find("span").text(item.title);
               $menuItem.attr("data-pageName", index);
               $menuItem.on("click", $.drcd.menuItemClick);
               $menuItemsContainer.append($menuItem);
           })
        },

        init: function(){

            $.drcd.menuItemsLoad();

            var ioSocket = io.connect();
            

            $(".btnServerStart").on("click",function(){
                ioSocket.emit("ServerStart",{"name":"Connor"})
            })

            $(".btnCoreprotect").on("click",function(){
                ioSocket.emit("Coreprotect",{"name":"Connor"})
            })
            
            if(window.location.href.endsWith(".htm") == true){
                this.loadPage('home');
            }else{
                this.loadPage('home');
            }
        }

    });
})(jQuery);
