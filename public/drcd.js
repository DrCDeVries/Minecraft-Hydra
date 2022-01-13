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
                home: {templateFile:'home.htm', title:'Home', 
                onLoad:function(){
                    $.drcd.slideShowLoad();
                },
                onClose:function(){
                    $.drcd.slideShowUnload();
                },
                },
                whitelisting: {templateFile:'whitelisting.htm', title:'Whitelisting'},
                rules: {templateFile:'rules.htm', title:'Rules'},
                contact: {templateFile:'contact.htm', title:'Contact'},
                test: {templateFile:'test.htm', title:'Test'},
                coreprotect: {templateFile:'coreprotect.htm', title:'Core Protect'},
                ajax: {templateFile:'ajax.htm', title:'Ajax'}

            },
            slideShow: {
                currentIndex: 0,
                images:[
                    {img:"/images/img1.jpg", title:"Redstone Farms"},
                    {img:"/images/img2.jpg", title:"Spawn"},
                    {img:"/images/img3.jpg", title:"Shopping"}
                ],
                timer: null
            }
                
            
        },
    
        
        loadPage : function(pageIndex){

            if(window.history.state && window.history.state.pageIndex){
                let lastPageIndex = window.history.state.pageIndex;
                let page = $.drcd.commonData.pages[lastPageIndex];
                try{
                    if (page.onClose !== undefined){
                        page.onClose();
                    }
                 }catch(ex){
                     console.error("logPage:onClose", lastPageIndex, ex);
                 }
            }

            let page = $.drcd.commonData.pages[pageIndex];

            $.get("/templates/" + page.templateFile).then(
                function(data){
                    $('.pageContent').empty().html(data);
                    window.history.pushState({"pageIndex":pageIndex}, page.title, "/page/" + pageIndex);
                    try{
                       if (page.onLoad !== undefined){
                           page.onLoad();
                       }
                    }catch(ex){
                        console.error("logPage:onLoad", pageIndex, ex);
                    }
                },
                function(err){
                    console.error(err);
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

        slideShowLoad: function(){
            console.log("loadSlideShow");
            $(".slideshow-container").find(".slideshow-prev").on("click", 
                function(){
                    if( $.drcd.commonData.slideShow.timer){
                        clearTimeout($.drcd.commonData.slideShow.timer)
                    }
                    if($.drcd.commonData.slideShow.currentIndex <= 0)    {
                        $.drcd.commonData.slideShow.currentIndex = $.drcd.commonData.slideShow.images.length - 1;
                    }else{
                        $.drcd.commonData.slideShow.currentIndex--;
                    }
                    $.drcd.slideShowShowSlide();
                }
            );
            $(".slideshow-container").find(".slideshow-next").on("click", 
                    function(){
                        if( $.drcd.commonData.slideShow.timer){
                            clearTimeout($.drcd.commonData.slideShow.timer)
                        }
                        if($.drcd.commonData.slideShow.currentIndex >= $.drcd.commonData.slideShow.images.length - 1)    {
                            $.drcd.commonData.slideShow.currentIndex = 0;
                        }else{
                            $.drcd.commonData.slideShow.currentIndex++;
                        }
                        $.drcd.slideShowShowSlide();    
                    }
            );
            $.drcd.commonData.slideShow.currentIndex = 0;
            $.drcd.slideShowShowSlide();
            if( $.drcd.commonData.slideShow.timer){
                clearTimeout($.drcd.commonData.slideShow.timer)
            }
            $.drcd.commonData.slideShow.timer = setTimeout($.drcd.slideShowInterval, 5000);
        },
        slideShowInterval : function(){
            if($.drcd.commonData.slideShow.currentIndex >= $.drcd.commonData.slideShow.images.length - 1)    {
                $.drcd.commonData.slideShow.currentIndex = 0;
            }else{
                $.drcd.commonData.slideShow.currentIndex++;
            }
            $.drcd.slideShowShowSlide();
            $.drcd.commonData.slideShow.timer = setTimeout($.drcd.slideShowInterval, 10000)
        },

        slideShowShowSlide: function(){
            let $slidesContainer = $(".slideshow-container").find(".slideshow-slides-container");
            let $slide =   $slidesContainer.find(".slideshow-slide");
            let item = $.drcd.commonData.slideShow.images[$.drcd.commonData.slideShow.currentIndex]            
            $slide.find(".slideshow-text").text(item.title);
            $slide.find("img").attr("src", item.img);
        },

        slideShowUnload: function(){
            console.log("unloadSlideShow");
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
            
            let pathName = window.location.pathname;
            if(pathName.startsWith("/page/") == true){
                let pageIndex = pathName.substring(6);
                this.loadPage(pageIndex);
            }else{
                this.loadPage('home');
            }
        }

    });
})(jQuery);
